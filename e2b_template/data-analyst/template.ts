import { Template } from '@e2b/code-interpreter'

export const template = Template()
  .fromTemplate('code-interpreter-v1')  // 使用 Code Interpreter 基础模板
  .runCmd('echo Hello World E2B!')

  // ── 系统依赖（PDF/OCR/图像处理所需）──────────────────────────────────────
  .runCmd('sudo apt-get update -qq')
  .runCmd('sudo apt-get install -y -qq poppler-utils ghostscript libglib2.0-0 libsm6 libxext6 libxrender-dev')
  .runCmd('sudo apt-get install -y -qq tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-chi-tra libtesseract-dev || sudo apt-get install -y -qq tesseract-ocr libtesseract-dev || true')
  .runCmd('sudo apt-get install -y -qq libgl1-mesa-glx || sudo apt-get install -y -qq libgl1 || true')

  // ── 核心数据分析 ──────────────────────────────────────────────────────────
  .pipInstall(['pandas', 'numpy', 'scipy', 'statsmodels', 'openpyxl', 'xlrd'])
  .pipInstall(['pyarrow', 'fastparquet', 'h5py'])
  .pipInstall(['matplotlib', 'seaborn', 'plotly', 'bokeh'])
  .pipInstall(['requests', 'beautifulsoup4', 'networkx', 'sympy', 'yfinance', 'faker'])
  .pipInstall(['scikit-learn', 'xgboost', 'lightgbm'])
  .pipInstall(['torch', 'torchvision', 'torchaudio'])
  .pipInstall(['psycopg2-binary', 'pymysql', 'sqlalchemy', 'pymongo', 'redis'])
  .pipInstall(['tabulate', 'openai', 'httpx', 'tqdm', 'rich', 'pydantic'])

  // ── 高性能 DataFrame ──────────────────────────────────────────────────────
  // polars: 比 pandas 快 10-100x，大数据集首选
  // dask: 超大数据集并行计算（内存放不下时）
  // modin: pandas 语法兼容的并行加速版本
  .pipInstall(['polars', 'dask[dataframe]', 'modin[dask]'])

  // ── 时间序列 ──────────────────────────────────────────────────────────────
  // prophet: Meta 出品，处理季节性时间序列
  // ta: 技术分析指标（金融数据）
  .pipInstall(['prophet', 'ta', 'pmdarima'])

  // ── 自动化 EDA & 数据质量 ─────────────────────────────────────────────────
  // ydata-profiling: 一行生成完整 EDA 报告（原 pandas-profiling）
  // missingno: 缺失值可视化
  // great-expectations: 数据验证框架
  .pipInstall(['ydata-profiling', 'missingno'])

  // ── 特征工程 ─────────────────────────────────────────────────────────────
  // category_encoders: 分类变量编码全套（Target/WOE/BinaryEncoder 等）
  // imbalanced-learn: 不平衡数据集处理（SMOTE 等）
  // feature-engine: 特征工程全套工具
  .pipInstall(['category_encoders', 'imbalanced-learn', 'feature-engine'])

  // ── Gradient Boosting 补全 ────────────────────────────────────────────────
  // catboost: 对分类特征原生支持，无需编码
  .pipInstall(['catboost'])

  // ── 图像处理 ─────────────────────────────────────────────────────────────
  // pillow: 基础图像处理
  // scikit-image: 科学图像处理算法
  // wordcloud: 词云生成
  .pipInstall(['pillow', 'scikit-image', 'wordcloud'])

  // ── 地理空间 ─────────────────────────────────────────────────────────────
  // geopandas: 地理空间 DataFrame
  // folium: 交互式地图（基于 Leaflet.js）
  // shapely: 几何对象操作
  .pipInstall(['geopandas', 'folium', 'shapely'])

  // ── 音频分析 ─────────────────────────────────────────────────────────────
  // librosa: 音频特征提取（MFCC、频谱等），数据分析标准库
  // soundfile: 音频文件读写
  .pipInstall(['librosa', 'soundfile'])

  // ── NLP 高级 ─────────────────────────────────────────────────────────────
  // transformers: HuggingFace 预训练模型
  // sentence-transformers: 文本向量化/语义相似度
  .pipInstall(['transformers', 'sentence-transformers'])

  // ── PDF 处理（SOTA）──────────────────────────────────────────────────────
  // pymupdf: 最快的 PDF 库，支持 PDF/XPS/EPUB 等格式，可提取文字/图片/表格
  // pymupdf4llm: 将 PDF 转为 LLM 友好的 Markdown，完整保留表格结构
  // pdfplumber: 复杂 PDF 表格提取备选方案
  // camelot-py: 专业 PDF 表格提取（需要 ghostscript + opencv）
  .pipInstall(['pymupdf', 'pymupdf4llm'])
  .pipInstall(['camelot-py[cv]', 'opencv-python-headless'])

  // ── Office 文档处理 ───────────────────────────────────────────────────────
  // python-docx: Word (.docx)
  // python-pptx: PowerPoint (.pptx)
  // markitdown: Microsoft 出品，将 PDF/Word/Excel/PPT/HTML 一键转 Markdown
  .pipInstall(['python-docx', 'python-pptx'])
  .pipInstall(['markitdown[all]'])

  // ── OCR（SOTA）───────────────────────────────────────────────────────────
  // easyocr: 深度学习 OCR，支持 80+ 语言，精度远超传统 Tesseract
  // pytesseract: Tesseract Python 绑定（快速轻量备选）
  .pipInstall(['easyocr', 'pytesseract'])

  // ── NLP ───────────────────────────────────────────────────────────────────
  .pipInstall(['nltk', 'spacy', 'textblob', 'gensim'])
  .runCmd('python -c "import nltk; nltk.download(\'punkt\'); nltk.download(\'averaged_perceptron_tagger\'); nltk.download(\'stopwords\'); nltk.download(\'wordnet\')"')
  .runCmd('python -m spacy download en_core_web_sm');