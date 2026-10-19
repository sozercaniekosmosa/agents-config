const fs = require('fs');
const path = require('path');

const ROOT_DIR = fs.existsSync(path.resolve(__dirname, '../../../../src'))
  ? path.resolve(__dirname, '../../../../')
  : path.resolve(__dirname, '../../../../../');
const WIDGETS_DIR = path.join(ROOT_DIR, 'src/widgets');

const getFiles = (dir, fileList = []) => {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFiles(filePath, fileList);
    } else if (filePath.endsWith('.tsx') && filePath.includes('cemis-')) {
      fileList.push(filePath);
    }
  }
  return fileList;
};

const files = getFiles(WIDGETS_DIR);
console.log(`🔍 [CEMIS] Запуск UI-валидатора. Найдено файлов: ${files.length}`);

let hasErrors = false;
const GUID_IN_GETVALUE_REGEX = /getValue\([\s\S]*?['"][0-9a-f]{8}-[0-9a-f]{4}/i;
const EMPTY_SELECT_VALUE_REGEX = /<Select\.Value[^>]*>\s*<\/Select\.Value>|<Select\.Value[^>]*\/>/i;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  const relativePath = path.relative(ROOT_DIR, file);

  if (GUID_IN_GETVALUE_REGEX.test(content)) {
    console.error(`❌ [UI Rule] Хардкод GUID в getValue найден в: ${relativePath}`);
    hasErrors = true;
  }

  if (EMPTY_SELECT_VALUE_REGEX.test(content)) {
    console.error(`❌ [UI Rule] Пустой Select.Value (без children) найден в: ${relativePath}`);
    hasErrors = true;
  }
});

if (hasErrors) {
  console.log('❌ Валидация UI выявила ошибки.');
  process.exit(1);
} else {
  console.log('✅ [CEMIS] Все UI-правила соблюдены.');
}
