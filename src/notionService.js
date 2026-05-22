const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const SHOPPING_DB = process.env.NOTION_DATABASE_ID;
const TODO_DB = process.env.NOTION_TODO_DATABASE_ID;

function toUTC8ISOString() {
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return utc8.toISOString().replace('Z', '+08:00');
}

/**
 * Upsert a shopping item:
 * - If a 待購買 item with the same name exists, append new conditions.
 * - Otherwise create a new row.
 * Returns { created: true } | { updated: true } | { exists: true } (no new conditions)
 */
async function addItemToNotion({ item, conditions, rawMessage, addedBy }) {
  const existing = await notion.databases.query({
    database_id: SHOPPING_DB,
    filter: {
      and: [
        { property: '品項', title: { equals: item } },
        { property: '狀態', select: { equals: '待購買' } },
      ],
    },
    page_size: 1,
  });

  if (existing.results.length > 0) {
    if (!conditions) return { exists: true };

    const page = existing.results[0];
    const existingCond = page.properties['條件說明'].rich_text[0]?.plain_text || '';

    // Check if this exact condition already exists to avoid duplicates
    const existingParts = existingCond.split('；').map(s => s.trim()).filter(Boolean);
    if (existingParts.includes(conditions.trim())) return { exists: true };

    const merged = existingCond ? `${existingCond}；${conditions}` : conditions;
    await notion.pages.update({
      page_id: page.id,
      properties: {
        '條件說明': { rich_text: [{ text: { content: merged } }] },
      },
    });
    return { updated: true };
  }

  await notion.pages.create({
    parent: { database_id: SHOPPING_DB },
    properties: {
      '品項':   { title:     [{ text: { content: item } }] },
      '條件說明': { rich_text: [{ text: { content: conditions || '' } }] },
      '原始訊息': { rich_text: [{ text: { content: rawMessage } }] },
      '加入者':  { rich_text: [{ text: { content: addedBy } }] },
      '狀態':   { select:    { name: '待購買' } },
      '新增日期': { date:      { start: toUTC8ISOString() } },
    },
  });
  return { created: true };
}

/**
 * Add a new todo item (always creates a new row in the todo database).
 */
async function addTodoToNotion({ item, conditions, rawMessage, addedBy }) {
  return notion.pages.create({
    parent: { database_id: TODO_DB },
    properties: {
      '任務':   { title:     [{ text: { content: item } }] },
      '備註':   { rich_text: [{ text: { content: conditions || '' } }] },
      '原始訊息': { rich_text: [{ text: { content: rawMessage } }] },
      '加入者':  { rich_text: [{ text: { content: addedBy } }] },
      '狀態':   { select:    { name: '待辦' } },
      '新增日期': { date:      { start: toUTC8ISOString() } },
    },
  });
}

/**
 * Fetch recent shopping items.
 */
async function getRecentItems(limit = 10) {
  const response = await notion.databases.query({
    database_id: SHOPPING_DB,
    sorts: [{ property: '新增日期', direction: 'descending' }],
    page_size: limit,
  });
  return response.results.map(page => ({
    item:       page.properties['品項'].title[0]?.plain_text || '（未命名）',
    conditions: page.properties['條件說明'].rich_text[0]?.plain_text || '',
    status:     page.properties['狀態'].select?.name || '待購買',
    addedBy:    page.properties['加入者'].rich_text[0]?.plain_text || '',
    date:       page.properties['新增日期'].date?.start?.slice(0, 10) || '',
  }));
}

/**
 * Fetch recent todo items.
 */
async function getRecentTodos(limit = 10) {
  const response = await notion.databases.query({
    database_id: TODO_DB,
    sorts: [{ property: '新增日期', direction: 'descending' }],
    page_size: limit,
  });
  return response.results.map(page => ({
    item:       page.properties['任務'].title[0]?.plain_text || '（未命名）',
    conditions: page.properties['備註'].rich_text[0]?.plain_text || '',
    status:     page.properties['狀態'].select?.name || '待辦',
    addedBy:    page.properties['加入者'].rich_text[0]?.plain_text || '',
    date:       page.properties['新增日期'].date?.start?.slice(0, 10) || '',
  }));
}

/**
 * Mark the most recent matching item as a given status.
 * Routes to the correct database based on the target status.
 */
async function updateItemStatus(itemName, status) {
  const isTodo = ['已完成', '已取消'].includes(status);
  const dbId      = isTodo ? TODO_DB    : SHOPPING_DB;
  const titleProp = isTodo ? '任務'     : '品項';

  const response = await notion.databases.query({
    database_id: dbId,
    filter: {
      property: titleProp,
      title: { contains: itemName },
    },
    sorts: [{ property: '新增日期', direction: 'descending' }],
    page_size: 1,
  });

  if (response.results.length === 0) return null;
  const pageId = response.results[0].id;
  return notion.pages.update({
    page_id: pageId,
    properties: { '狀態': { select: { name: status } } },
  });
}

/**
 * Archive (soft-delete) the most recent matching item.
 * Searches shopping DB first, then todo DB.
 */
async function deleteItem(itemName) {
  const targets = [
    { dbId: SHOPPING_DB, titleProp: '品項' },
    { dbId: TODO_DB,     titleProp: '任務' },
  ];
  for (const { dbId, titleProp } of targets) {
    const response = await notion.databases.query({
      database_id: dbId,
      filter: { property: titleProp, title: { contains: itemName } },
      sorts: [{ property: '新增日期', direction: 'descending' }],
      page_size: 1,
    });
    if (response.results.length > 0) {
      await notion.pages.update({
        page_id: response.results[0].id,
        archived: true,
      });
      return true;
    }
  }
  return false;
}

module.exports = { addItemToNotion, addTodoToNotion, getRecentItems, getRecentTodos, updateItemStatus, deleteItem };
