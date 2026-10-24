const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function files(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(dir, entry.name);
        return entry.isDirectory() ? files(file) : [file];
    });
}
for (const dir of ['plugin', 'scripts', 'tests']) {
    for (const file of files(path.join(root, dir)).filter(file => /\.(?:c?js)$/.test(file))) {
        const check = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
        if (check.status !== 0) process.exit(check.status || 1);
    }
}
const info = JSON.parse(fs.readFileSync(path.join(root, 'plugin/info.json')));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
if (info.version !== pkg.version) throw new Error('插件和开发工具版本不一致');
const ids = info.options.map(o => o.identifier);
if (new Set(ids).size !== ids.length) throw new Error('重复的选项标识符');
for (const option of info.options) {
    if (option.type === 'menu' && !option.menuValues.some(v => v.value === option.defaultValue)) throw new Error('无效默认值：' + option.identifier);
    if (/key|token/i.test(option.identifier) && option.identifier !== 'maxOutputTokens' && option.textConfig?.type !== 'secure') throw new Error('凭据字段必须隐藏：' + option.identifier);
}
console.log('JavaScript 语法、版本与插件选项检查通过');
