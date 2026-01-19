import { Template } from '@e2b/code-interpreter'

export const template = Template()
  .fromTemplate('code-interpreter-v1')  // 使用 Code Interpreter 基础模板
  .runCmd('echo Hello World E2B!')
  // 分批安装包
  .pipInstall(['pandas', 'numpy', 'scipy', 'statsmodels', 'openpyxl'])
  .pipInstall(['pyarrow', 'fastparquet', 'h5py'])
  .pipInstall(['matplotlib', 'seaborn', 'plotly', 'bokeh'])
  .pipInstall(['requests', 'beautifulsoup4', 'networkx', 'sympy', 'yfinance', 'faker'])
  .pipInstall(['scikit-learn', 'xgboost', 'lightgbm'])
  .pipInstall(['torch', 'torchvision', 'torchaudio'])
  .pipInstall(['nltk', 'spacy', 'textblob', 'gensim'])
  .runCmd('python -c "import nltk; nltk.download(\'punkt\'); nltk.download(\'averaged_perceptron_tagger\'); nltk.download(\'stopwords\'); nltk.download(\'wordnet\')"')
  .runCmd('python -m spacy download en_core_web_sm');