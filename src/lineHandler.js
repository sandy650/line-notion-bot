const { parseMessage } = require('./messageParser');
const { addItemToNotion, addTodoToNotion, getRecentItems, getRecentTodos, updateItemStatus, deleteItem } = require('./notionService');

// In-memory dedup: prevent processing the same LINE message twice (e.g. webhook retry)
const _seenMessageIds = new Set();
function isNewMessage(id) {
  if (_seenMessageIds.has(id)) return false;
  _seenMessageIds.add(id);
  if (_seenMessageIds.size > 500) _seenMessageIds.delete(_seenMessageIds.values().next().value);
  return true;
}

// Trigger words for built-in commands
const CMD_LIST = ['清單', '列表', 'list'];
const CMD_TODO_LIST = ['待辦清單', 'todo清單', 'todolist'];
const CMD_HELP = ['說明', 'help', '幫助'];
// Shopping status commands: "已買 冰箱", "已放棄 沙發"
const CMD_BOUGHT_RE = /^已買\s+(.+)$/;
const CMD_GIVE_UP_RE = /^已放棄\s+(.+)$/;
// Todo commands: "待辦 買菜", "待辦：買菜", "todo 繳費", "完成 買菜", "取消 買菜"
const CMD_TODO_RE = /^(?:待辦|todo)[：:\s]+(.+)$/i;
const CMD_DONE_RE = /^完成\s+(.+)$/;
const CMD_CANCEL_RE = /^取消\s+(.+)$/;
// Delete command: "刪除 冰箱"
const CMD_DELETE_RE = /^刪除\s+(.+)$/;

const HELP_TEXT =
  '使用說明\n\n' +
  '【採購清單】\n' +
  '直接輸入想買的物品，Bot 自動記錄。\n' +
  '  冰箱 預算15000內\n' +
  '  沙發 三人座 布面\n\n' +
  '  清單         查看最近10筆採購記錄\n' +
  '  已買 冰箱    標記為已購買\n' +
  '  已放棄 沙發  標記為已放棄\n' +
  '  刪除 冰箱    從清單中移除\n\n' +
  '【代辦事項】\n' +
  '以「待辦」或「todo」開頭輸入任務。\n' +
  '  待辦 買菜\n' +
  '  todo 繳水電費 本月底前\n\n' +
  '  待辦清單     查看最近10筆代辦事項\n' +
  '  完成 買菜    標記為已完成\n' +
  '  取消 買菜    標記為已取消\n' +
  '  刪除 買菜    從代辦中移除\n\n' +
  '  說明         顯示此說明';

async function handleEvent(event, client) {
  // Only handle text messages
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  // Ignore duplicate webhook retries
  if (!isNewMessage(event.message.id)) return null;

  const text = event.message.text.trim();
  if (!text) return null;

  const { source, replyToken } = event;

  // --- Get sender display name ---
  let senderName = '未知';
  try {
    if (source.type === 'group') {
      const profile = await client.getGroupMemberProfile(source.groupId, source.userId);
      senderName = profile.displayName;
    } else if (source.type === 'room') {
      // room member profile API is deprecated; fall back to user profile
      try {
        const profile = await client.getRoomMemberProfile(source.roomId, source.userId);
        senderName = profile.displayName;
      } catch {
        const profile = await client.getProfile(source.userId);
        senderName = profile.displayName;
      }
    } else {
      const profile = await client.getProfile(source.userId);
      senderName = profile.displayName;
    }
  } catch (e) {
    console.warn('[Profile]', e.message);
  }

  const reply = msg =>
    client.replyMessage({ replyToken, messages: [{ type: 'text', text: msg }] });

  const lowerText = text.toLowerCase();

  // --- Help ---
  if (CMD_HELP.includes(lowerText)) {
    return reply(HELP_TEXT);
  }

  // --- Shopping list ---
  if (CMD_LIST.includes(lowerText)) {
    try {
      const items = await getRecentItems(10);
      return reply(formatList(items));
    } catch (e) {
      console.error('[List Error]', e);
      return reply('無法取得清單，請稍後再試。');
    }
  }

  // --- Todo list ---
  if (CMD_TODO_LIST.includes(lowerText)) {
    try {
      const items = await getRecentTodos(10);
      return reply(formatTodoList(items));
    } catch (e) {
      console.error('[Todo List Error]', e);
      return reply('無法取得代辦清單，請稍後再試。');
    }
  }

  // --- Already bought ---
  const boughtMatch = text.match(CMD_BOUGHT_RE);
  if (boughtMatch) {
    const itemName = boughtMatch[1].trim();
    try {
      const updated = await updateItemStatus(itemName, '已購買');
      if (!updated) return reply(`找不到「${itemName}」的記錄。`);
      return reply(`已將「${itemName}」標記為已購買！`);
    } catch (e) {
      console.error('[Update Error]', e);
      return reply('更新失敗，請稍後再試。');
    }
  }

  // --- Give up ---
  const giveUpMatch = text.match(CMD_GIVE_UP_RE);
  if (giveUpMatch) {
    const itemName = giveUpMatch[1].trim();
    try {
      const updated = await updateItemStatus(itemName, '已放棄');
      if (!updated) return reply(`找不到「${itemName}」的記錄。`);
      return reply(`已將「${itemName}」標記為已放棄。`);
    } catch (e) {
      console.error('[Update Error]', e);
      return reply('更新失敗，請稍後再試。');
    }
  }

  // --- Mark todo as done ---
  const doneMatch = text.match(CMD_DONE_RE);
  if (doneMatch) {
    const taskName = doneMatch[1].trim();
    try {
      const updated = await updateItemStatus(taskName, '已完成');
      if (!updated) return reply(`找不到「${taskName}」的代辦事項。`);
      return reply(`已將「${taskName}」標記為已完成！`);
    } catch (e) {
      console.error('[Done Error]', e);
      return reply('更新失敗，請稍後再試。');
    }
  }

  // --- Cancel todo ---
  const cancelMatch = text.match(CMD_CANCEL_RE);
  if (cancelMatch) {
    const taskName = cancelMatch[1].trim();
    try {
      const updated = await updateItemStatus(taskName, '已取消');
      if (!updated) return reply(`找不到「${taskName}」的代辦事項。`);
      return reply(`已將「${taskName}」標記為已取消。`);
    } catch (e) {
      console.error('[Cancel Error]', e);
      return reply('更新失敗，請稍後再試。');
    }
  }

  // --- Add todo ---
  const todoMatch = text.match(CMD_TODO_RE);
  if (todoMatch) {
    const remaining = todoMatch[1].trim();
    const spaceIdx = remaining.search(/\s/);
    const taskName = spaceIdx === -1 ? remaining : remaining.slice(0, spaceIdx);
    const notes = spaceIdx === -1 ? '' : remaining.slice(spaceIdx + 1).trim();
    try {
      await addTodoToNotion({
        item: taskName,
        conditions: notes,
        rawMessage: text,
        addedBy: senderName,
      });
      const notesLine = notes ? `\n備註：${notes}` : '';
      return reply(`代辦已記錄！\n任務：${taskName}${notesLine}\n加入者：${senderName}`);
    } catch (e) {
      console.error('[Todo Error]', e);
      return reply('記錄失敗，請稍後再試。');
    }
  }

  // --- Delete item ---
  const deleteMatch = text.match(CMD_DELETE_RE);
  if (deleteMatch) {
    const itemName = deleteMatch[1].trim();
    try {
      const deleted = await deleteItem(itemName);
      if (!deleted) return reply(`找不到「${itemName}」的記錄。`);
      return reply(`已將「${itemName}」從清單中移除。`);
    } catch (e) {
      console.error('[Delete Error]', e);
      return reply('刪除失敗，請稍後再試。');
    }
  }

  // Bare "待辦" or "todo" with no task name — ignore silently
  if (/^(?:待辦|todo)$/i.test(text)) return null;

  // --- Record any other message as shopping item ---
  const parsed = parseMessage(text);
  try {
    const result = await addItemToNotion({
      item: parsed.item,
      conditions: parsed.conditions,
      rawMessage: text,
      addedBy: senderName,
    });

    if (result.exists) {
      return reply(`「${parsed.item}」已在採購清單中（待購買）。`);
    } else if (result.updated) {
      const conditionLine = parsed.conditions ? `\n新增條件：${parsed.conditions}` : '';
      return reply(`條件已更新！\n品項：${parsed.item}${conditionLine}\n加入者：${senderName}`);
    } else {
      const conditionLine = parsed.conditions ? `\n條件：${parsed.conditions}` : '';
      return reply(`已記錄！\n品項：${parsed.item}${conditionLine}\n加入者：${senderName}`);
    }
  } catch (e) {
    console.error('[Notion Error]', e);
    return reply('記錄失敗，請稍後再試。');
  }
}

function formatList(items) {
  if (!items || items.length === 0) return '目前清單是空的！';

  const lines = items.map((item, i) => {
    const icon =
      item.status === '已購買' ? '[買]' : item.status === '已放棄' ? '[棄]' : '[待]';
    const cond = item.conditions ? `\n     條件：${item.conditions}` : '';
    const meta = [item.addedBy, item.date].filter(Boolean).join(' · ');
    const metaLine = meta ? `\n     ${meta}` : '';
    return `${icon} ${i + 1}. ${item.item}${cond}${metaLine}`;
  });

  return `採購清單（最近10筆）\n\n${lines.join('\n')}`;
}

function formatTodoList(items) {
  if (!items || items.length === 0) return '目前沒有代辦事項！';

  const lines = items.map((item, i) => {
    const icon =
      item.status === '已完成' ? '[完]' : item.status === '已取消' ? '[消]' : '[待]';
    const notes = item.conditions ? `\n     備註：${item.conditions}` : '';
    const meta = [item.addedBy, item.date].filter(Boolean).join(' · ');
    const metaLine = meta ? `\n     ${meta}` : '';
    return `${icon} ${i + 1}. ${item.item}${notes}${metaLine}`;
  });

  return `代辦清單（最近10筆）\n\n${lines.join('\n')}`;
}

module.exports = { handleEvent };
