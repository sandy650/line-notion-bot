/**
 * Parse free-form message into item name and conditions.
 *
 * Examples:
 *   "冰箱 預算15000內"       -> { item: "冰箱", conditions: "預算15000內" }
 *   "沙發 三人座 布面"        -> { item: "沙發", conditions: "三人座 布面" }
 *   "要買洗衣機 滾筒式 8kg"   -> { item: "洗衣機", conditions: "滾筒式 8kg" }
 *
 * Strategy:
 * 1. If message contains a known appliance/furniture keyword, use that as the item name.
 * 2. Otherwise, use the first whitespace-separated token as the item name.
 * 3. Everything after the item name is treated as conditions.
 */

const KNOWN_ITEMS = [
  // 大型家電
  '冰箱', '冰櫃', '洗衣機', '烘衣機', '洗烘脫', '冷氣', '空調', '電視', '電視機',
  '微波爐', '烤箱', '氣炸鍋', '洗碗機', '烘碗機', '抽油煙機', '瓦斯爐', '電磁爐',
  '熱水器', '除濕機', '空氣清淨機', '電風扇', '吊扇', '暖爐', '電暖器',
  // 小家電
  '吸塵器', '掃地機器人', '電鍋', '電子鍋', '果汁機', '咖啡機', '豆漿機',
  '電熱水壺', '麵包機', '電磁爐', '蒸氣熨斗', '吹風機', '除毛球機',
  // 家具
  '沙發', '床', '床架', '床墊', '衣櫃', '書櫃', '電視櫃', '餐桌', '餐椅',
  '書桌', '辦公椅', '茶几', '收納櫃', '鞋櫃', '梳妝台', '浴室櫃', '廚房櫃',
  '置物架', '層架', '掛架', '窗簾', '地毯', '燈具', '吊燈', '壁燈', '檯燈',
  // 衛浴
  '馬桶', '浴缸', '淋浴間', '面盆', '洗手台',
  // 3C
  '電腦', '筆電', '平板', '手機', '印表機', '路由器', '監視器', '攝影機',
];

function parseMessage(text) {
  const trimmed = text.trim();

  // 1. Search for a known item keyword in the message
  const foundItem = KNOWN_ITEMS.find(keyword => trimmed.includes(keyword));

  if (foundItem) {
    // Remove the keyword from the text, treat the rest as conditions
    const conditions = trimmed
      .replace(foundItem, '')
      .replace(/^[\s，,、。]+|[\s，,、。]+$/g, '') // trim leading/trailing punctuation
      .trim();
    return { item: foundItem, conditions };
  }

  // 2. Fallback: first token = item, rest = conditions
  const match = trimmed.match(/^(\S+)\s*([\s\S]*)$/);
  if (!match) {
    return { item: trimmed, conditions: '' };
  }

  const item = match[1].replace(/[，。！？、]/g, '');
  const conditions = match[2].trim();
  return { item, conditions };
}

module.exports = { parseMessage };
