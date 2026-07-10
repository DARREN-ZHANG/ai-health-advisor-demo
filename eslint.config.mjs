// 使用相对路径导入，避免根目录 node_modules 缺失 workspace 链接时解析失败
import baseConfig from './packages/config/eslint.config.base.mjs';
export default baseConfig;
