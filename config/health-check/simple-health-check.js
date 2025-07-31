const axios = require('axios');
const { config, validateConfig } = require('./load-config');

class SimpleHealthCheck {
  constructor() {
    this.config = config;
    this.token = null;
  }

  // Headers exactos como k6 que funciona
  getHeaders(token = null) {
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'accept-language': 'es-419,es;q=0.9',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0',
      'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Microsoft Edge";v="138"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin'
    };

    if (token) {
      headers['authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  async run() {
    console.log('🚀 LibreChat Health Check - Iniciando...');
    validateConfig();

    try {
      // 1. Configuración inicial
      await this.loadConfig();
      
      // 2. Login
      await this.login();
      
      // 3. Carga de datos esenciales
      await this.loadEssentialData();
      
      // 4. Envío de mensaje
      await this.sendMessage();
      
      console.log('✅ Health Check completado exitosamente');
      
    } catch (error) {
      console.error('❌ Health Check falló:', error.message);
      throw error;
    }
  }

  async loadConfig() {
    console.log('⚙️ Cargando configuración inicial...');
    
    try {
      // GET /api/config
      await axios.get(`${this.config.baseUrl}/api/config`, {
        headers: {
          ...this.getHeaders(),
          'referer': `${this.config.baseUrl}/login`
        }
      });

      // GET /api/banner
      await axios.get(`${this.config.baseUrl}/api/banner`, {
        headers: {
          ...this.getHeaders(),
          'referer': `${this.config.baseUrl}/login`
        }
      });
    } catch (error) {
      throw new Error(`Error cargando configuración: ${error.message}`);
    }
  }

  async login() {
    console.log('🔑 Realizando login...');
    
    try {
      const response = await axios.post(`${this.config.baseUrl}/api/auth/login`, {
        email: this.config.email,
        password: this.config.password,
      }, {
        headers: {
          ...this.getHeaders(),
          'content-type': 'application/json',
          'origin': this.config.baseUrl,
          'referer': `${this.config.baseUrl}/login`,
        }
      });

      if (response.status !== 200 || !response.data.token) {
        throw new Error(`Login falló: status ${response.status}`);
      }

      this.token = response.data.token;
      console.log('   ✅ Login exitoso');
    } catch (error) {
      throw new Error(`Error en login: ${error.message}`);
    }
  }

  async loadEssentialData() {
    console.log('📊 Cargando datos esenciales...');
    
    try {
      // GET /api/user
      await axios.get(`${this.config.baseUrl}/api/user`, {
        headers: {
          ...this.getHeaders(this.token),
          'referer': `${this.config.baseUrl}/c/new`
        }
      });

      // GET /api/agents
      await axios.get(`${this.config.baseUrl}/api/agents?order=desc&limit=100`, {
        headers: {
          ...this.getHeaders(this.token),
          'referer': `${this.config.baseUrl}/c/new`
        }
      });
    } catch (error) {
      throw new Error(`Error cargando datos esenciales: ${error.message}`);
    }
  }

  async sendMessage() {
    console.log('💬 Enviando mensaje de test...');
    
    try {
      // Payload para test del agente
      const payload = {
        text: 'mensaje test diario, responde test ok',
        sender: 'User',
        clientTimestamp: new Date().toISOString(),
        isCreatedByUser: true,
        parentMessageId: '00000000-0000-0000-0000-000000000000',
        messageId: this.generateUUID(),
        error: false,
        generation: '',
        endpoint: 'agents',
        agent_id: this.config.agentId,
        key: new Date().toISOString(),
        isContinued: false,
        isTemporary: false
      };

      const response = await axios.post(`${this.config.baseUrl}/api/agents/chat`, payload, {
        headers: {
          ...this.getHeaders(this.token),
          'content-type': 'application/json',
          'origin': this.config.baseUrl,
          'referer': `${this.config.baseUrl}/c/new`,
        }
      });

      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Chat falló: status ${response.status}`);
      }

      // Validar contenido de la respuesta para detectar errores
      this.validateResponseContent(response.data);

      console.log(`   ✅ Mensaje enviado (status: ${response.status})`);
      console.log(`   📋 Response size: ${JSON.stringify(response.data).length} chars`);
    } catch (error) {
      throw new Error(`Error enviando mensaje: ${error.message}`);
    }
  }

  validateResponseContent(data) {
    const dataStr = JSON.stringify(data).toLowerCase();
    
    // Detectar errores comunes en las respuestas
    const errorPatterns = [
      'error occurred while processing',
      'googlegenerativeai error',
      'error fetching from',
      'not found for api version',
      'is not supported for',
      'call listmodels to see',
      '404 not found',
      '500 internal server error',
      'something went wrong',
      'an error occurred',
      'error:',
      'exception:',
      'failed to',
      'unable to',
      'invalid',
      'unauthorized',
      'forbidden',
      'rate limit exceeded',
      'quota exceeded',
      'service unavailable'
    ];
    
    // Buscar patrones de error en la respuesta
    for (const pattern of errorPatterns) {
      if (dataStr.includes(pattern)) {
        // Extraer mensaje de error más específico si es posible
        let errorMessage = `Error detectado en respuesta: ${pattern}`;
        
        // Intentar extraer el mensaje de error completo
        if (data && typeof data === 'object') {
          if (data.error) {
            errorMessage = `Error en respuesta: ${data.error}`;
          } else if (data.message && dataStr.includes('error')) {
            errorMessage = `Error en respuesta: ${data.message}`;
          } else if (typeof data.text === 'string' && data.text.includes('error')) {
            errorMessage = `Error en respuesta del chat: ${data.text}`;
          }
        }
        
        throw new Error(errorMessage);
      }
    }
    
    // Validaciones adicionales específicas para LibreChat
    if (data && typeof data === 'object') {
      // Si la respuesta contiene un campo 'error' con valor true
      if (data.error === true) {
        throw new Error(`Error reportado en respuesta: ${data.message || 'Error no especificado'}`);
      }
      
      // Si la respuesta del chat contiene texto de error específico
      if (data.text && typeof data.text === 'string') {
        const responseText = data.text.toLowerCase();
        if (responseText.includes('something went wrong') || 
            responseText.includes('an error occurred') ||
            responseText.includes('error:') ||
            responseText.includes('failed') ||
            responseText.includes('unable to process')) {
          throw new Error(`Error en respuesta del chat: ${data.text}`);
        }
      }
      
      // Verificar si hay una respuesta válida del agente
      if (!data.text || data.text.trim() === '') {
        throw new Error('Respuesta vacía del agente - posible error en el servicio');
      }
    }
    
    console.log('   ✅ Respuesta validada - sin errores detectados');
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  const healthCheck = new SimpleHealthCheck();
  healthCheck.run().catch(console.error);
}

module.exports = SimpleHealthCheck; 