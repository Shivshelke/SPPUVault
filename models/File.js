/**
 * models/File.js — Native MongoDB driver collection wrapper
 */
const { createModel } = require('../utils/db');

const File = createModel('files', {
  contentType: 'regular',
  pattern: '2024',
  downloadGate: {
    enabled: false,
    type: 'none',
    whatsappUrl: '',
    telegramUrl: ''
  },
  isPinned: false,
  solutionUrl: '',
  solutionType: 'none',
  solutionOriginalName: '',
  solutionPublicId: ''
});

module.exports = File;
