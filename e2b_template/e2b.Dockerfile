# e2b.Dockerfile
# Base image for Code Interpreter (Critical for port 49999)
FROM e2bdev/code-interpreter:latest

# 1. Install Core Data Science & IO packages
RUN pip install --no-cache-dir \
    numpy \
    pandas \
    scipy \
    statsmodels \
    openpyxl \
    pyarrow \
    fastparquet \
    h5py

# 2. Install Visualization & Utilities
RUN pip install --no-cache-dir \
    matplotlib \
    seaborn \
    plotly \
    bokeh \
    requests \
    beautifulsoup4 \
    networkx \
    sympy \
    yfinance \
    faker

# 3. Install Machine Learning (Scikit-learn, XGBoost, LightGBM)
RUN pip install --no-cache-dir \
    scikit-learn \
    xgboost \
    lightgbm

# 4. Install Deep Learning (PyTorch CPU only to save space)
# We use the extra-index-url to get the cpu-only version which is much smaller
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# 5. Install NLP packages
RUN pip install --no-cache-dir \
    nltk \
    spacy \
    textblob \
    gensim

# Pre-download NLTK data
RUN python -c "import nltk; nltk.download('punkt'); nltk.download('averaged_perceptron_tagger'); nltk.download('stopwords'); nltk.download('wordnet')"

# Pre-download Spacy model
RUN python -m spacy download en_core_web_sm