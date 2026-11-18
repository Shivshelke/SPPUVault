/**
 * models/TelegramPromo.js — Native MongoDB driver collection wrapper
 */
const { createModel } = require('../utils/db');

const TelegramPromo = createModel('telegrampromos', {
  key: 'telegram_promo',
  popupEnabled: true,
  popupTitle: 'Join {year} SPPU Telegram Community',
  popupText: 'Get In-Sem & End-Sem IMP Questions, Handwritten Notes, Solved Papers and Exam Alerts directly on Telegram!',
  popupButtonText: '🚀 Join Telegram Group',
  popupContinueText: 'Continue to Papers →',
  bannerEnabled: true,
  bannerText: '📢 {year} SPPU Discussion & IMPs Group',
  bannerButtonText: 'Join Telegram ↗',
  defaultUrl: 'https://t.me/synapse_support_bot',
  firstYearUrl: '',
  secondYearUrl: '',
  thirdYearUrl: '',
  fourthYearUrl: ''
});

module.exports = TelegramPromo;
