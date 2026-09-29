import js from '@eslint/js';
import globals from 'globals';
export default [{ignores:['dist/**','artifacts/**','public/**']},js.configs.recommended,{files:['**/*.js','**/*.mjs'],languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.browser,...globals.node}},rules:{'no-unused-vars':['error',{argsIgnorePattern:'^_'}]}}];
