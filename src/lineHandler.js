const { parseMessage } = require('./messageParser');
const { addItemToNotion, getRecentItems, updateItemStatus } = require('./notionService');

// Trigger words for built-in commands
const CMD_LIST = ['清單', '列表', 'list'];
const CMD_HELP = ['說明', 'help', '幫助'];
// "已買 冰箱" or "已放棄 沙發"
const CMD_BOUGHT_RE = /^已買\s+(.+)$/;
const CMD_GIVE_UP_RE = /^已放棄\s+(.+)$/;

const HELP_TEXT =
  '使用說明\n\n' +
  '直接輸入想買的物品，Bot 會自動記錄到 Notion。\n\n' +
  '範例：\n' +
  '  冰箱 預算15000內\n' +
  '  沙發 三人座 布面\n' +
  '  洗衣機 滾筒式 8kg以上\n\n' +
  '指令：\n' +
  '  清單         查看最近10筆記錄\n' +
  '  已買 冰箱    將最新的冰箱標記為已購買\n' +
  '  已放棄 沙發  將最新的沙發標記為已放棄\n' +
  '  說明         顯示此說明';

async function handleEvent(event, client) {
  // Only handle text messages
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const text = event.message.text.trim();
  const { source, replyToken } = event;

  // --- Get sender display name ---
  let senderName = '未知';
  try {
    if (source.type === 'group') {
      const profile = await client.getGroupMemberProfile(source.groupId, source.userId);
      senderName = profile.displayName;
    } else if (source.type === 'room') {
      const profile = await client.getRoomMemberProfile(source.roomId, source.userId);
      senderName = profile.displayName;
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

  // --- List ---
  if (CMD_LIST.includes(lowerText)) {
    try {
      const items = await getRecentItems(10);
      return reply(formatList(items));
    } catch (e) {
      console.error('[List Error]', e);
      return reply('無法取得清單，請稍後再試。');
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

  // --- Record any other message ---
  const parsed = parseMessage(text);
  try {
    await addItemToNotion({
      item: parsed.item,
      conditions: parsed.conditions,
      rawMessage: text,
      addedBy: senderName,
    });

    const conditionLine = parsed.conditions ? `\n條件：${parsed.conditions}` : '';
    return reply(`已記錄！\n品項：${parsed.item}${conditionLine}\n加入者：${senderName}`);
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
    const cond = item.conditions ? `\n     └ ${item.conditions}` : '';
    return `${icon} ${i + 1}. ${item.item}${cond}`;
  });

  return `採購清單（最近10筆）\n\n${lines.join('\n')}`;
}

module.exports = { handleEvent };
