#!/bin/bash
echo "🚀 开始启动AI图像搜索服务..."
echo "📁 当前目录: $(pwd)"
echo "📦 检查dist目录..."
ls -la dist/ || echo "❌ dist目录不存在，尝试重新构建..."
echo "🔧 运行编译后的代码..."
node dist/index.js 