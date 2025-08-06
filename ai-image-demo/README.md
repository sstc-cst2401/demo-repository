# 🎨 AI图像搜索器

一个智能的图像搜索应用，支持中文描述搜索并自动选择最佳匹配图片。

## ✨ 功能特性

- 🔤 **中文翻译**: 自动将中文描述翻译成英文关键词
- 🔍 **智能搜索**: 使用 Unsplash API 搜索高质量图片
- 🏆 **最佳选择**: AI 自动选择最符合描述的图片
- 🎨 **美观界面**: 现代化的响应式设计
- ⚡ **快速响应**: 优化的搜索和展示流程

## 📁 项目结构

```
ai-image-demo/
├── frontend/
│   └── index.html          # 🔵 前端页面
├── backend/
│   ├── index.ts            # 🔴 后端逻辑
│   ├── .env                # API 密钥配置
│   └── env.example         # 环境变量示例
├── package.json            # 项目配置
├── tsconfig.json           # TypeScript 配置
└── README.md               # 项目说明
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd ai-image-demo
npm install
```

### 2. 配置 API 密钥

复制环境变量示例文件：
```bash
cp backend/env.example backend/.env
```

编辑 `.env` 文件，填入您的 API 密钥：
```env
# OpenAI API 密钥
OPENAI_API_KEY=your_openai_api_key_here

# Unsplash API 密钥
UNSPLASH_ACCESS_KEY=your_unsplash_access_key_here
UNSPLASH_SECRET_KEY=your_unsplash_secret_key_here
```

### 3. 启动服务

```bash
npm run dev
```

### 4. 访问应用

打开浏览器访问：`http://localhost:3000`

## 🔧 API 端点

- `GET /health` - 健康检查
- `POST /search-images` - 图片搜索（主要功能）

## 📝 使用示例

1. 在输入框中输入中文描述，例如：
   - "一只可爱的小猫坐在花园里，阳光明媚"
   - "美丽的日落风景，海天一色"
   - "现代化的城市夜景，灯火辉煌"

2. 点击"搜索图片"按钮

3. 等待 AI 处理：
   - 翻译中文描述为英文关键词
   - 搜索相关图片
   - 选择最佳匹配图片

4. 查看结果，绿色标识的为最佳匹配图片

## 🛠️ 技术栈

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **后端**: Node.js, Express.js, TypeScript
- **AI 服务**: OpenAI GPT-3.5-turbo
- **图片服务**: Unsplash API
- **开发工具**: TypeScript, ts-node

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！ 