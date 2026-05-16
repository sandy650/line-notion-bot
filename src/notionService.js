const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

/**
 * Add a new item to the Notion database.
 */
async function addItemToNotion({ item, conditions, rawMessage, addedBy }) {
  return notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      '品項': {
        title: [{ text: { content: item } }],
      },
      '條件說明': {
        rich_text: [{ text: { content: conditions || '' } }],
      },
      '原始訊息': {
        rich_text: [{ text: { content: rawMessage } }],
      },
      '加入者': {
        rich_text: [{ text: { content: addedBy } }],
      },
      '狀態': {
        select: { name: '待購買' },
      },
      '新增日期': {
        date: { start: new Date().toISOString() },
      },
    },
  });
}

/**
 * Fetch the most recent items from the Notion database.
 */
async function getRecentItems(limit = 10) {
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    sorts: [{ property: '新增日期', direction: 'descending' }],
    page_size: limit,
  });

  return response.results.map(page => ({
    item: page.properties['品項'].title[0]?.plain_text || '（未命名）',
    conditions: page.properties['條件說明'].rich_text[0]?.plain_text || '',
    status: page.properties['狀態'].select?.name || '待購買',
    addedBy: page.properties['加入者'].rich_text[0]?.plain_text || '',
  }));
}

/**
 * Mark the most recent matching item as a given status.
 */
async function updateItemStatus(itemName, status) {
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      property: '品項',
      title: { contains: itemName },
    },
    sorts: [{ property: '新增日期', direction: 'descending' }],
    page_size: 1,
  });

  if (response.results.length === 0) return null;

  const pageId = response.results[0].id;
  return notion.pages.update({
    page_id: pageId,
    properties: {
      '狀態': { select: { name: status } },
    },
  });
}

module.exports = { addItemToNotion, getRecentItems, updateItemStatus };
