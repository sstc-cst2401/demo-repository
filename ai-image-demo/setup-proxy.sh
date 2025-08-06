#!/bin/bash

echo "🔧 AI图像搜索器 - 代理配置工具"
echo "=================================="

# 检查是否已有代理配置
if [ -n "$HTTP_PROXY" ] || [ -n "$HTTPS_PROXY" ]; then
    echo "✅ 检测到现有代理配置:"
    echo "   HTTP_PROXY: $HTTP_PROXY"
    echo "   HTTPS_PROXY: $HTTPS_PROXY"
else
    echo "❌ 未检测到代理配置"
fi

echo ""
echo "请选择配置方式:"
echo "1. 手动输入代理地址"
echo "2. 使用系统代理设置"
echo "3. 测试网络连接"
echo "4. 退出"

read -p "请输入选择 (1-4): " choice

case $choice in
    1)
        echo ""
        read -p "请输入代理地址 (例如: http://127.0.0.1:7890): " proxy_url
        if [ -n "$proxy_url" ]; then
            echo "export HTTP_PROXY=$proxy_url" >> ~/.zshrc
            echo "export HTTPS_PROXY=$proxy_url" >> ~/.zshrc
            echo "✅ 代理配置已添加到 ~/.zshrc"
            echo "请运行 'source ~/.zshrc' 或重新打开终端"
        fi
        ;;
    2)
        echo ""
        echo "🔍 检测系统代理设置..."
        # 检测 macOS 系统代理
        if command -v networksetup &> /dev/null; then
            http_proxy=$(networksetup -getwebproxy "Wi-Fi" | grep "Server:" | awk '{print $2}')
            http_port=$(networksetup -getwebproxy "Wi-Fi" | grep "Port:" | awk '{print $2}')
            if [ -n "$http_proxy" ] && [ -n "$http_port" ]; then
                proxy_url="http://$http_proxy:$http_port"
                echo "✅ 检测到系统代理: $proxy_url"
                echo "export HTTP_PROXY=$proxy_url" >> ~/.zshrc
                echo "export HTTPS_PROXY=$proxy_url" >> ~/.zshrc
                echo "代理配置已添加到 ~/.zshrc"
            else
                echo "❌ 未检测到系统代理设置"
            fi
        fi
        ;;
    3)
        echo ""
        echo "🔍 测试网络连接..."
        echo "测试 OpenAI API 连接..."
        if curl -s --connect-timeout 10 https://api.openai.com > /dev/null; then
            echo "✅ OpenAI API 连接正常"
        else
            echo "❌ OpenAI API 连接失败"
        fi
        
        echo "测试 Unsplash API 连接..."
        if curl -s --connect-timeout 10 https://api.unsplash.com > /dev/null; then
            echo "✅ Unsplash API 连接正常"
        else
            echo "❌ Unsplash API 连接失败"
        fi
        ;;
    4)
        echo "👋 退出配置工具"
        exit 0
        ;;
    *)
        echo "❌ 无效选择"
        ;;
esac

echo ""
echo "📝 使用说明:"
echo "1. 配置代理后，重新启动服务: npm run dev"
echo "2. 如果使用 VPN，确保 VPN 可以访问 OpenAI"
echo "3. 常见代理地址:"
echo "   - Clash: http://127.0.0.1:7890"
echo "   - V2Ray: http://127.0.0.1:1087"
echo "   - Shadowsocks: http://127.0.0.1:1080" 