import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import path from 'path';

// 加载环境变量
dotenv.config({ path: './backend/.env' });

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务
app.use(express.static(path.join(__dirname, '../frontend')));

// 根路径路由 - 提供前端页面
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: path.join(__dirname, '../frontend') });
});

// 初始化 OpenAI 客户端
const openaiConfig: any = {
    apiKey: process.env.OPENAI_API_KEY,
};

// 如果配置了代理，添加代理支持
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (proxyUrl) {
        openaiConfig.httpAgent = new HttpsProxyAgent(proxyUrl);
        console.log(`🔗 使用代理: ${proxyUrl}`);
    }
}

const openai = new OpenAI(openaiConfig);

// Unsplash API 配置
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const UNSPLASH_SECRET_KEY = process.env.UNSPLASH_SECRET_KEY;
const UNSPLASH_BASE_URL = 'https://api.unsplash.com';

// 类型定义
interface SearchRequest {
    description: string;
}

interface UnsplashImage {
    id: string;
    urls: {
        regular: string;
        small: string;
        thumb: string;
    };
    alt_description: string;
    description: string;
    user: {
        name: string;
    };
}

interface UnsplashResponse {
    results: UnsplashImage[];
}

interface ProcessedImage {
    id: string;
    url: string;
    title: string;
    description: string;
    photographer: string;
    isBest: boolean;
}

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'AI图像搜索器服务运行正常',
        features: ['中文翻译', '图片搜索', '最佳图片选择']
    });
});

// 主要搜索端点
app.post('/search-images', async (req, res) => {
    try {
        const { description }: SearchRequest = req.body;

        if (!description) {
            return res.status(400).json({ error: '请提供中文描述' });
        }

        console.log(`收到搜索请求，中文描述: ${description}`);

        // 步骤1: 用 OpenAI 把中文翻译成英文关键词
        const englishKeywords = await translateToEnglish(description);
        console.log(`翻译结果: ${englishKeywords}`);

        // 步骤2: 用 Unsplash API 搜索图片
        const images = await searchUnsplashImages(englishKeywords);
        console.log(`找到 ${images.length} 张图片`);

        // 步骤3: 用 OpenAI 选择最佳图片
        const bestImageIndex = await selectBestImage(description, images);
        console.log(`最佳图片索引: ${bestImageIndex}`);

        // 步骤4: 处理结果
        const processedImages = images.map((image, index) => ({
            id: image.id,
            url: image.urls.regular,
            title: image.alt_description || image.description || englishKeywords,
            description: `摄影师: ${image.user.name}`,
            photographer: image.user.name,
            isBest: index === bestImageIndex
        }));

        res.json({
            originalDescription: description,
            translation: englishKeywords,
            images: processedImages,
            totalCount: processedImages.length,
            bestImageIndex: bestImageIndex
        });

    } catch (error) {
        console.error('搜索图片时出错:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('OpenAI')) {
                return res.status(500).json({ error: 'OpenAI API 配置错误，请检查 API 密钥' });
            }
            if (error.message.includes('Unsplash')) {
                return res.status(500).json({ error: 'Unsplash API 配置错误，请检查 Access Key' });
            }
        }
        
        res.status(500).json({ error: '搜索图片时发生错误，请稍后重试' });
    }
});

// 中文翻译成英文关键词
async function translateToEnglish(chineseDescription: string): Promise<string> {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API 密钥未配置');
    }

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `你是一个专业的图像搜索专家。你的任务是：
1. 首先分析用户的中文描述，理解用户想要什么样的图片（风格、主题、情感、场景等）
2. 然后基于这个理解，生成最适合图像搜索的英文关键词

关键词要求：
- 简洁准确，包含主要视觉元素
- 考虑图片的风格、主题、情感、场景、颜色等
- 使用常见的图像搜索词汇
- 避免过于抽象的描述，专注于可视觉化的元素

只返回英文关键词，不要其他解释。`
                },
                {
                    role: "user",
                    content: `请分析以下中文描述并生成英文搜索关键词：${chineseDescription}`
                }
            ],
            max_tokens: 1500,
            temperature: 0.3
        });

        const keywords = response.choices[0].message.content?.trim();
        if (!keywords) {
            throw new Error('翻译结果为空');
        }

        return keywords;
    } catch (error) {
        console.error('翻译失败:', error);
        throw new Error('OpenAI 翻译服务失败');
    }
}

// 搜索 Unsplash 图片
async function searchUnsplashImages(keywords: string): Promise<UnsplashImage[]> {
    if (!UNSPLASH_ACCESS_KEY) {
        throw new Error('Unsplash Access Key 未配置');
    }

    try {
        const response = await axios.get<UnsplashResponse>(`${UNSPLASH_BASE_URL}/search/photos`, {
            headers: {
                'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`
            },
            params: {
                query: keywords,
                per_page: 8,
                orientation: 'landscape'
            }
        });

        return response.data.results;
    } catch (error) {
        console.error('Unsplash 搜索失败:', error);
        throw new Error('Unsplash 图片搜索失败');
    }
}

// 选择最佳图片
async function selectBestImage(originalDescription: string, images: UnsplashImage[]): Promise<number> {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API 密钥未配置');
    }

    if (images.length === 0) {
        return -1;
    }

    try {
        // 构建详细的图片信息列表，包含URL和描述
        const imageDetails = images.map((image, index) => {
            const description = image.alt_description || image.description || '无描述';
            const photographer = image.user.name;
            const imageUrl = image.urls.regular;
            
            return `${index + 1}. 图片URL: ${imageUrl}\n   描述: ${description}\n   摄影师: ${photographer}`;
        }).join('\n\n');

        const response = await openai.chat.completions.create({
            model: "gpt-o3",
            messages: [
                {
                    role: "system",
                    content: `你是一个专业的图像选择专家。你的任务是：
1. 仔细查看用户提供的所有图片
2. 分析每张图片的视觉内容、风格、主题、情感等
3. 根据用户的中文描述，选择最符合用户需求的图片

选择标准：
- 图片内容与用户描述的主题匹配度
- 图片风格和情感与用户需求的一致性
- 图片质量和视觉效果
- 整体符合度（综合考虑所有因素）

请仔细分析每张图片，然后选择最符合用户描述的一张。只返回图片编号（1-${images.length}），不要其他解释。`
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `用户描述：${originalDescription}\n\n请查看以下图片并选择最符合描述的图片编号（1-${images.length}）：`
                        },
                        ...images.map(image => ({
                            type: "image_url" as const,
                            image_url: {
                                url: image.urls.regular
                            }
                        }))
                    ]
                }
            ],
            max_tokens: 1000,
            temperature: 0.1
        });

        const result = response.choices[0].message.content?.trim();
        if (!result) {
            return 0; // 默认选择第一张
        }

        // 解析返回的编号
        const match = result.match(/\d+/);
        if (match) {
            const index = parseInt(match[0]) - 1;
            return Math.max(0, Math.min(index, images.length - 1));
        }

        return 0; // 默认选择第一张
    } catch (error) {
        console.error('选择最佳图片失败:', error);
        
        // 如果GPT-4 Vision不可用，回退到基于描述的选择
        console.log('回退到基于描述的选择方法');
        return await selectBestImageFallback(originalDescription, images);
    }
}

// 回退方法：基于图片描述选择最佳图片
async function selectBestImageFallback(originalDescription: string, images: UnsplashImage[]): Promise<number> {
    try {
        // 构建图片描述列表
        const imageDescriptions = images.map((image, index) => 
            `${index + 1}. ${image.alt_description || image.description || '无描述'}`
        ).join('\n');

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "你是一个专业的图像选择专家。请根据用户的中文描述，从提供的图片列表中选择最符合描述的一张图片。只返回图片编号（1-8），不要其他解释。"
                },
                {
                    role: "user",
                    content: `用户描述：${originalDescription}\n\n可选图片：\n${imageDescriptions}\n\n请选择最符合描述的图片编号（1-${images.length}）：`
                }
            ],
            max_tokens: 10,
            temperature: 0.1
        });

        const result = response.choices[0].message.content?.trim();
        if (!result) {
            return 0; // 默认选择第一张
        }

        // 解析返回的编号
        const match = result.match(/\d+/);
        if (match) {
            const index = parseInt(match[0]) - 1;
            return Math.max(0, Math.min(index, images.length - 1));
        }

        return 0; // 默认选择第一张
    } catch (error) {
        console.error('回退选择方法也失败:', error);
        return 0; // 出错时默认选择第一张
    }
}

// 错误处理中间件
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('服务器错误:', err);
    res.status(500).json({ error: '服务器内部错误' });
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({ error: '接口不存在' });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 AI图像搜索器服务已启动`);
    console.log(`📍 服务地址: http://localhost:${PORT}`);
    console.log(`🔍 健康检查: http://localhost:${PORT}/health`);
    console.log(`🎨 图片搜索: POST http://localhost:${PORT}/search-images`);
    
    // 检查环境变量
    if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️  OpenAI API 密钥未配置，翻译和选择功能将不可用');
    }
    if (!process.env.UNSPLASH_ACCESS_KEY) {
        console.warn('⚠️  Unsplash Access Key 未配置，图片搜索功能将不可用');
    }
});

export default app;
