const axios = require('axios');
const { config, validateConfig } = require('./load-config');
const EmailNotifier = require('../services/email-notifier');

class HealthCheckWithEmail {
  constructor() {
    this.config = config;
    this.token = null;
    this.testStartTime = null;
    this.testResults = {
      success: false,
      error: null,
      duration: 0,
      steps: {
        config: false,
        login: false,
        loadData: false,
        sendMessage: false
      },
      details: {}
    };
    this.emailNotifier = new EmailNotifier();
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
    console.log('🚀 LibreChat Health Check con Notificaciones - Iniciando...');
    this.testStartTime = Date.now();
    
    try {
      validateConfig();
      
      // 1. Configuración inicial
      await this.loadConfig();
      this.testResults.steps.config = true;
      
      // 2. Login
      await this.login();
      this.testResults.steps.login = true;
      
      // 3. Carga de datos esenciales
      await this.loadEssentialData();
      this.testResults.steps.loadData = true;
      
      // 4. Envío de mensaje
      await this.sendMessage();
      this.testResults.steps.sendMessage = true;
      
      // Test exitoso
      this.testResults.success = true;
      this.testResults.duration = Date.now() - this.testStartTime;
      
      console.log('✅ Health Check completado exitosamente');
      
      // Enviar notificación de éxito
      await this.sendSuccessNotification();
      
    } catch (error) {
      this.testResults.success = false;
      this.testResults.error = error.message;
      this.testResults.duration = Date.now() - this.testStartTime;
      
      console.error('❌ Health Check falló:', error.message);
      
      // Enviar notificación de error
      await this.sendErrorNotification(error);
      
      throw error;
    }
  }

  async loadConfig() {
    console.log('⚙️ Cargando configuración inicial...');
    
    try {
      // GET /api/config
      const configResponse = await axios.get(`${this.config.baseUrl}/api/config`, {
        headers: {
          ...this.getHeaders(),
          'referer': `${this.config.baseUrl}/login`
        }
      });
      
      this.testResults.details.configStatus = configResponse.status;

      // GET /api/banner
      const bannerResponse = await axios.get(`${this.config.baseUrl}/api/banner`, {
        headers: {
          ...this.getHeaders(),
          'referer': `${this.config.baseUrl}/login`
        }
      });
      
      this.testResults.details.bannerStatus = bannerResponse.status;
      
    } catch (error) {
      throw new Error(`Error en configuración inicial: ${error.message}`);
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
      this.testResults.details.loginStatus = response.status;
      console.log('   ✅ Login exitoso');
      
    } catch (error) {
      throw new Error(`Error en login: ${error.message}`);
    }
  }

  async loadEssentialData() {
    console.log('📊 Cargando datos esenciales...');
    
    try {
      // GET /api/user
      const userResponse = await axios.get(`${this.config.baseUrl}/api/user`, {
        headers: {
          ...this.getHeaders(this.token),
          'referer': `${this.config.baseUrl}/c/new`
        }
      });
      
      this.testResults.details.userDataStatus = userResponse.status;

      // GET /api/agents
      const agentsResponse = await axios.get(`${this.config.baseUrl}/api/agents?order=desc&limit=100`, {
        headers: {
          ...this.getHeaders(this.token),
          'referer': `${this.config.baseUrl}/c/new`
        }
      });
      
      this.testResults.details.agentsDataStatus = agentsResponse.status;
      
    } catch (error) {
      throw new Error(`Error cargando datos esenciales: ${error.message}`);
    }
  }

  async sendMessage() {
    console.log('💬 Enviando mensaje de test...');
    
    try {
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

      // Guardar respuesta completa antes de validar
      this.testResults.details.fullResponseContent = JSON.stringify(response.data);
      
      // Validar contenido de la respuesta para detectar errores
      this.validateResponseContent(response.data);

      this.testResults.details.messageStatus = response.status;
      this.testResults.details.responseSize = JSON.stringify(response.data).length;
      
      console.log(`   ✅ Mensaje enviado (status: ${response.status})`);
      console.log(`   📋 Response size: ${this.testResults.details.responseSize} chars`);
      
    } catch (error) {
      throw new Error(`Error enviando mensaje: ${error.message}`);
    }
  }

  async sendSuccessNotification() {
    console.log('📧 Enviando notificación de éxito...');
    
    const emailData = {
      subject: `✅ Health Check Exitoso - ${this.config.appTitle}`,
      isSuccess: true,
      testResults: this.testResults,
      config: this.config
    };
    
    try {
      // Enviar solo al primer email para notificaciones de éxito
      await this.emailNotifier.sendNotification(emailData, this.config.adminEmailSuccess);
      console.log('   ✅ Notificación de éxito enviada');
    } catch (error) {
      console.error('   ❌ Error enviando notificación de éxito:', error.message);
    }
  }

  async sendErrorNotification(error) {
    console.log('📧 Enviando notificación de error...');
    
    const emailData = {
      subject: `❌ Health Check Falló - ${this.config.appTitle}`,
      isSuccess: false,
      testResults: this.testResults,
      config: this.config,
      error: error.message
    };
    
    try {
      // Enviar a todos los emails para notificaciones de error
      await this.emailNotifier.sendNotification(emailData, this.config.adminEmailError);
      console.log('   ✅ Notificación de error enviada');
    } catch (emailError) {
      console.error('   ❌ Error enviando notificación de error:', emailError.message);
    }
  }

  validateResponseContent(data) {
    const dataStr = JSON.stringify(data).toLowerCase();
    
    // Guardar la respuesta completa del agente para debugging (contenido completo como health-check-audit original)
    this.testResults.details.fullResponseContent = JSON.stringify(data);
    
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
        // Determinar tipo de error
        let errorType = 'UNKNOWN_ERROR';
        if (pattern.includes('not found') || pattern.includes('404')) {
          errorType = 'MODEL_NOT_FOUND';
        } else if (pattern.includes('rate limit') || pattern.includes('quota')) {
          errorType = 'API_LIMIT_EXCEEDED';
        } else if (pattern.includes('unauthorized') || pattern.includes('forbidden')) {
          errorType = 'AUTHENTICATION_ERROR';
        } else if (pattern.includes('googlegenerativeai') || pattern.includes('generative')) {
          errorType = 'GEMINI_API_ERROR';
        } else if (pattern.includes('processing') || pattern.includes('went wrong')) {
          errorType = 'PROCESSING_ERROR';
        }
        
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
        
        // Guardar detalles del error para el reporte
        this.testResults.details.errorDetected = true;
        this.testResults.details.errorMessage = errorMessage;
        this.testResults.details.detectedErrorPattern = pattern;
        this.testResults.details.errorType = errorType;
        this.testResults.details.responseContent = JSON.stringify(data);
        
        throw new Error(errorMessage);
      }
    }
    
    // Validaciones adicionales específicas para LibreChat
    if (data && typeof data === 'object') {
      // Si la respuesta contiene un campo 'error' con valor true
      if (data.error === true) {
        const errorMessage = `Error reportado en respuesta: ${data.message || 'Error no especificado'}`;
        this.testResults.details.errorDetected = true;
        this.testResults.details.errorMessage = errorMessage;
        this.testResults.details.detectedErrorPattern = 'response_error_flag';
        this.testResults.details.errorType = 'RESPONSE_ERROR';
        this.testResults.details.responseContent = JSON.stringify(data);
        throw new Error(errorMessage);
      }
      
      // Si la respuesta del chat contiene texto de error específico
      if (data.text && typeof data.text === 'string') {
        const responseText = data.text.toLowerCase();
        if (responseText.includes('something went wrong') || 
            responseText.includes('an error occurred') ||
            responseText.includes('error:') ||
            responseText.includes('failed') ||
            responseText.includes('unable to process')) {
          const errorMessage = `Error en respuesta del chat: ${data.text}`;
          this.testResults.details.errorDetected = true;
          this.testResults.details.errorMessage = errorMessage;
          this.testResults.details.detectedErrorPattern = 'error_in_text_response';
          this.testResults.details.errorType = 'CHAT_RESPONSE_ERROR';
          this.testResults.details.responseContent = JSON.stringify(data);
          throw new Error(errorMessage);
        }
      }
      
      // Verificar si hay una respuesta válida del agente
      if (!data.text || data.text.trim() === '') {
        const errorMessage = 'Respuesta vacía del agente - posible error en el servicio';
        this.testResults.details.errorDetected = true;
        this.testResults.details.errorMessage = errorMessage;
        this.testResults.details.detectedErrorPattern = 'empty_response';
        this.testResults.details.errorType = 'EMPTY_RESPONSE';
        this.testResults.details.responseContent = JSON.stringify(data);
        throw new Error(errorMessage);
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
  const healthCheck = new HealthCheckWithEmail();
  healthCheck.run().catch(error => {
    console.error('❌ Health Check falló completamente:', error.message);
    process.exit(1);
  });
}

module.exports = HealthCheckWithEmail; 