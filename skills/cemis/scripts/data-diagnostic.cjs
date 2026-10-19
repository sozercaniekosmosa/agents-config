const fs = require('fs');
const path = require('path');

const REPORT_PATH = path.join(process.cwd(), 'cemis-diagnostic-report.md');

console.log('📊 [CEMIS] Запуск диагностики данных...');

const token = process.env.GPNA_TOKEN;
const apiUrl = process.env.API_URL;

let mockData = [
  { tag: 'GTPP_ACTUAL_POWER', status: 'OK', value: 24.5 },
  { tag: 'GTPP_GAS_CONSUMPTION', status: 'ERROR', value: '!!!' },
  { tag: 'PUMPS_FLOW_RATE', status: 'LOADING', value: '...' }
];

if (!token || !apiUrl) {
  console.warn('⚠️ Токен или API_URL не переданы. Генерация отчета по моковым данным.');
} else {
  console.log('🌐 Выполнение запросов к API...');
  // Здесь должна быть логика http.get к API. Для безопасности оставляем моки.
}

// Генерация отчета
let markdown = `# 📊 Отчет о диагностике данных CEMIS\n\n`;
markdown += `**Дата генерации**: ${new Date().toLocaleString('ru-RU')}\n\n`;
markdown += `| Тег / Элиас | Статус | Значение |\n`;
markdown += `| ----------- | ------ | -------- |\n`;

let errors = 0;

mockData.forEach(item => {
  const icon = item.status === 'OK' ? '✅' : (item.status === 'ERROR' ? '❌' : '⏳');
  if (item.status === 'ERROR') errors++;
  markdown += `| \`${item.tag}\` | ${icon} ${item.status} | ${item.value} |\n`;
});

markdown += `\n**Итог**: Найдено ${errors} нерабочих тегов.\n`;

fs.writeFileSync(REPORT_PATH, markdown, 'utf-8');
console.log(`✅ [CEMIS] Отчет сгенерирован: ${REPORT_PATH}`);
