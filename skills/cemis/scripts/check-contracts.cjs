const fs = require('fs');
const path = require('path');

const ROOT_DIR = fs.existsSync(path.resolve(__dirname, '../../../../src'))
  ? path.resolve(__dirname, '../../../../')
  : path.resolve(__dirname, '../../../../../');
const SWAGGER_HIST_PATH = path.join(ROOT_DIR, 'src/shared/api/openapi/historical/swagger.json');
const TEMPLATES_PATH = path.join(ROOT_DIR, 'src/entities/cemis/api/cemis-property-templates.ts');

const GUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

console.log('🔍 [CEMIS] Запуск валидации контрактов...');

let hasErrors = false;

// 1. Проверка Swagger
try {
  const swagger = JSON.parse(fs.readFileSync(SWAGGER_HIST_PATH, 'utf-8'));
  const hasHistoryFallback = Object.keys(swagger.paths || {}).some(p => p.includes('history-with-fallback'));
  
  if (!hasHistoryFallback) {
    console.error('❌ [API] Не найден эндпоинт history-with-fallback в historical/swagger.json!');
    hasErrors = true;
  } else {
    console.log('✅ [API] Контракт historical/swagger.json содержит fallback-эндпоинты.');
  }
} catch (e) {
  console.error(`❌ Ошибка чтения swagger.json: ${e.message}`);
}

// 2. Проверка GUID в шаблонах
try {
  const templatesContent = fs.readFileSync(TEMPLATES_PATH, 'utf-8');
  const guids = templatesContent.match(GUID_REGEX);
  
  if (guids && guids.length > 0) {
    console.warn(`⚠️ [UI] Обнаружены захардкоженные legacy GUID в cemis-property-templates.ts:`);
    guids.forEach(g => console.warn(`   - ${g}`));
    console.warn(`   Убедитесь, что идет миграция на элиасы!`);
  } else {
    console.log('✅ [UI] В cemis-property-templates.ts отсутствуют legacy GUIDs.');
  }
} catch (e) {
  console.error(`❌ Ошибка чтения cemis-property-templates.ts: ${e.message}`);
}

if (hasErrors) {
  process.exit(1);
} else {
  console.log('✅ [CEMIS] Контракты валидны.');
}
