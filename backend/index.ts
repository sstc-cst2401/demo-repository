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
            model: "o4-mini",
            messages: [
                {
                    role: "system",
                    content: `Extract a single, highly relevant keyword from a user's description of their intended image use, to be used as an image search term.

- Read the user's description of the desired picture use carefully.
- Determine the main subject, concept, or object central to the intended image use.
- Think through the reasoning step-by-step before you choose the keyword: identify significant nouns or concepts, consider which one best represents the core of the query, and select the most informative and concise word.
- Output only the single most relevant keyword. Do not add any explanation or extra words.
- If the input contains multiple subjects or is ambiguous, choose the term that would best yield effective search results.
- If the core subject is a phrase (e.g., 'red apple'), output it as-is; otherwise, provide the single word.

**Output Format:**
- Return only a single word or phrase most suited for image searching, with no additional text, in plain text (no quotation marks or formatting).

**Example 1**
Input: I need an image that can be used in a healthy eating brochure.

Reasoning: 
- The key concept is "Healthy Eating"  
- Most central noun: "Healthy Eating"  
- Best keyword: "Healthy Eating"  
Output: Healthy Eating

**Example 2**
Input: Need an image suitable for creating a company annual meeting invitation.

Reasoning:
- Main use: "Company Annual Meeting Invitation"
- Central concept: "Annual Meeting"
- Best keyword: "Annual Meeting"

Output: Annual Meeting

**Example 3**  
Input: I want to find an image that represents success to motivate employees.  

Reasoning:  
- Main idea: "success"  
- Intended use: employee motivation  
- Best keyword representing concept: "success"  

Output: Success  

_Reminder: The task is to extract the best single keyword or phrase (no more than 3-4 characters if possible) for image searching; always reason step-by-step before making your final selection; output only the keyword/phrase, nothing else.`
                },
                {
                    role: "user",
                    content: `请分析以下中文描述并生成英文搜索关键词：${chineseDescription}`
                }
            ],
            max_completion_tokens: 1500
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
            model: "o4-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a senior web-page designer.

Task
1. The user gives you N images (numbered 1 … N) and describes the usage scenario.  
2. Silently (internally) perform step-by-step reasoning:
   • Infer the visual requirements from the scenario (environment, style, content, size, colour, atmosphere, etc.).  
   • List concrete selection criteria.  
   • Rank these criteria from most to least important (ignore resolution and copyright).  
   • Evaluate every image against every criterion in order, eliminating candidates until only one remains.  
3. DO NOT reveal your reasoning.  
4. Output a single line of valid JSON that contains only the index (1-based) of the best image.

Output format (must be exact)
\`\`\`json
{"best_image_index": X}
\`\`\``
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `Usage scenario: ${originalDescription}\n\nPlease evaluate the following ${images.length} images and select the best one:`
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
            max_completion_tokens: 1000
        });

        const result = response.choices[0].message.content?.trim();
        if (!result) {
            return 0; // 默认选择第一张
        }

        // 尝试解析JSON格式的返回结果
        try {
            const jsonResult = JSON.parse(result);
            if (jsonResult.best_image_index && typeof jsonResult.best_image_index === 'number') {
                const index = jsonResult.best_image_index - 1; // 转换为0基索引
                return Math.max(0, Math.min(index, images.length - 1));
            }
        } catch (parseError) {
            console.log('JSON解析失败，尝试解析数字:', parseError);
        }

        // 如果JSON解析失败，回退到数字解析
        const match = result.match(/\d+/);
        if (match) {
            const index = parseInt(match[0]) - 1;
            return Math.max(0, Math.min(index, images.length - 1));
        }

        return 0; // 默认选择第一张
    } catch (error) {
        console.error('选择最佳图片失败:', error);
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
