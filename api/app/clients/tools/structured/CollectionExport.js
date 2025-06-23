const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { Pool } = require('pg');
const { v4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');

// Dynamic imports for file handling
let createFile;
let getStrategyFunctions;
let FileSources;
let FileContext;
let PDFDocument;

/**
 * Collection Export Tool
 * Provides functionality to export collections in various formats (JSON, XML, PDF)
 */
class CollectionExport extends Tool {
  constructor(fields = {}) {
    super();

    this.name = 'collection_export';
    this.description =
      'Export LibreChat collections in various formats (JSON, XML, PDF). Can export single collections or recursively include child collections.';

    this.schema = z.object({
      action: z.enum(['export_collection']),
      collection_id: z.string().uuid('Collection ID must be a valid UUID'),
      format: z.enum(['json', 'xml', 'pdf']).default('json'),
      recursive: z.boolean().default(false).describe('Include child collections in export'),
    });

    this.userId = fields.userId;

    // Database configuration
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'vectordb',
      port: process.env.POSTGRES_PORT || 5432,
      database: process.env.POSTGRES_DB || 'mydatabase',
      user: process.env.POSTGRES_USER || 'myuser',
      password: process.env.POSTGRES_PASSWORD || 'mypassword',
    });

    // Initialize ready promise for database setup
    this.ready = this.initializeDatabase();
  }

  async initializeDatabase() {
    try {
      const client = await this.pool.connect();
      client.release();
      logger.info('Collection Export tool database connection established');
    } catch (error) {
      logger.error('Collection Export tool database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get all child collection IDs recursively
   */
  async getAllChildCollectionIds(client, parentIds) {
    const allIds = [...parentIds];
    let currentParentIds = [...parentIds];

    while (currentParentIds.length > 0) {
      const result = await client.query(
        'SELECT id FROM collections WHERE parent_id = ANY($1) AND user_id = $2',
        [currentParentIds, this.userId],
      );

      const childIds = result.rows.map((row) => row.id);
      if (childIds.length === 0) break;

      allIds.push(...childIds);
      currentParentIds = childIds;
    }

    return allIds;
  }

  /**
   * Get collection data including notes and child collections
   */
  async getCollectionData(collectionId, recursive = false) {
    const client = await this.pool.connect();
    try {
      // Get collection info
      const collectionResult = await client.query(
        'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
        [collectionId, this.userId],
      );

      if (collectionResult.rows.length === 0) {
        throw new Error('Collection not found or access denied');
      }

      const collection = collectionResult.rows[0];

      // Get all collection IDs to include (with children if recursive)
      let collectionIds = [collectionId];
      if (recursive) {
        collectionIds = await this.getAllChildCollectionIds(client, [collectionId]);
      }

      // Get all collections data
      const collectionsResult = await client.query(
        'SELECT * FROM collections WHERE id = ANY($1) ORDER BY created_at',
        [collectionIds],
      );

      // Get all notes for these collections
      const notesResult = await client.query(
        'SELECT * FROM notes WHERE collection_id = ANY($1) ORDER BY created_at',
        [collectionIds],
      );

      return {
        collection: collection,
        collections: collectionsResult.rows,
        notes: notesResult.rows,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Generate JSON format export
   */
  generateJSON(data) {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Generate XML format export
   */
  generateXML(data) {
    const escapeXml = (str) => {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    const formatDate = (date) => {
      return new Date(date).toISOString();
    };

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<collection-export>\n';
    xml += `  <export-date>${formatDate(new Date())}</export-date>\n`;
    xml += `  <main-collection>\n`;
    xml += `    <id>${data.collection.id}</id>\n`;
    xml += `    <name>${escapeXml(data.collection.name)}</name>\n`;
    xml += `    <description>${escapeXml(data.collection.description || '')}</description>\n`;
    xml += `    <created-at>${formatDate(data.collection.created_at)}</created-at>\n`;
    xml += `    <updated-at>${formatDate(data.collection.updated_at)}</updated-at>\n`;

    if (data.collection.tags && data.collection.tags.length > 0) {
      xml += `    <tags>\n`;
      data.collection.tags.forEach((tag) => {
        xml += `      <tag>${escapeXml(tag)}</tag>\n`;
      });
      xml += `    </tags>\n`;
    }

    xml += `  </main-collection>\n`;

    if (data.collections && data.collections.length > 1) {
      xml += `  <sub-collections>\n`;
      data.collections.forEach((collection) => {
        if (collection.id !== data.collection.id) {
          xml += `    <collection>\n`;
          xml += `      <id>${collection.id}</id>\n`;
          xml += `      <name>${escapeXml(collection.name)}</name>\n`;
          xml += `      <description>${escapeXml(collection.description || '')}</description>\n`;
          xml += `      <parent-id>${collection.parent_id || ''}</parent-id>\n`;
          xml += `      <created-at>${formatDate(collection.created_at)}</created-at>\n`;
          xml += `      <updated-at>${formatDate(collection.updated_at)}</updated-at>\n`;

          if (collection.tags && collection.tags.length > 0) {
            xml += `      <tags>\n`;
            collection.tags.forEach((tag) => {
              xml += `        <tag>${escapeXml(tag)}</tag>\n`;
            });
            xml += `      </tags>\n`;
          }

          xml += `    </collection>\n`;
        }
      });
      xml += `  </sub-collections>\n`;
    }

    if (data.notes && data.notes.length > 0) {
      xml += `  <notes>\n`;
      data.notes.forEach((note) => {
        xml += `    <note>\n`;
        xml += `      <id>${note.id}</id>\n`;
        xml += `      <collection-id>${note.collection_id}</collection-id>\n`;
        xml += `      <title>${escapeXml(note.title)}</title>\n`;
        xml += `      <content>${escapeXml(note.content)}</content>\n`;
        xml += `      <source-url>${escapeXml(note.source_url || '')}</source-url>\n`;
        xml += `      <created-at>${formatDate(note.created_at)}</created-at>\n`;
        xml += `      <updated-at>${formatDate(note.updated_at)}</updated-at>\n`;

        if (note.tags && note.tags.length > 0) {
          xml += `      <tags>\n`;
          note.tags.forEach((tag) => {
            xml += `        <tag>${escapeXml(tag)}</tag>\n`;
          });
          xml += `      </tags>\n`;
        }

        xml += `    </note>\n`;
      });
      xml += `  </notes>\n`;
    }

    xml += '</collection-export>\n';
    return xml;
  }

  /**
   * Generate PDF format export
   */
  generatePDF(data) {
    const formatDate = (date) => {
      return new Date(date).toLocaleDateString() + ' ' + new Date(date).toLocaleTimeString();
    };

    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    // Collect PDF data in chunks
    doc.on('data', (chunk) => chunks.push(chunk));

    // Title with background
    doc.fillColor('#2c3e50').fontSize(24).text('COLLECTION EXPORT', { align: 'center' });
    doc.fillColor('#7f8c8d').fontSize(12).text(`Export Date: ${formatDate(new Date())}`, { align: 'center' });
    doc.moveDown(1.5);

    // Main Collection with styled header
    doc.fillColor('#34495e').fontSize(18).text('MAIN COLLECTION', { underline: true });
    doc.fillColor('#2c3e50').rect(50, doc.y + 2, doc.page.width - 100, 2).fill();
    doc.moveDown(0.8);
    
    doc.fillColor('#2c3e50').fontSize(14).font('Helvetica-Bold')
      .text(data.collection.name, { continued: false });
    doc.fillColor('#34495e').fontSize(11).font('Helvetica')
      .text(`Description: ${data.collection.description || 'No description'}`)
      .fillColor('#7f8c8d').fontSize(10)
      .text(`Created: ${formatDate(data.collection.created_at)}`)
      .text(`Updated: ${formatDate(data.collection.updated_at)}`);

    if (data.collection.tags && data.collection.tags.length > 0) {
      doc.fillColor('#8e44ad').fontSize(10)
        .text(`Tags: ${data.collection.tags.join(', ')}`);
    }

    doc.moveDown(1.5);

    // Sub-collections with distinct styling
    if (data.collections && data.collections.length > 1) {
      doc.fillColor('#16a085').fontSize(16).text('SUB-COLLECTIONS', { underline: true });
      doc.fillColor('#16a085').rect(50, doc.y + 2, doc.page.width - 100, 1).fill();
      doc.moveDown(0.8);
      
      data.collections.forEach((collection) => {
        if (collection.id !== data.collection.id) {
          // Sub-collection box background
          const boxY = doc.y;
          doc.fillColor('#ecf0f1').rect(60, boxY - 5, doc.page.width - 120, 60).fill();
          
          doc.fillColor('#2c3e50').fontSize(12).font('Helvetica-Bold')
            .text(`> ${collection.name}`, 70, boxY, { continued: false });
          doc.fillColor('#34495e').fontSize(10).font('Helvetica')
            .text(`${collection.description || 'No description'}`, 70)
            .fillColor('#7f8c8d').fontSize(9)
            .text(`Created: ${formatDate(collection.created_at)}`, 70);
          
          if (collection.tags && collection.tags.length > 0) {
            doc.fillColor('#8e44ad').fontSize(9)
              .text(`Tags: ${collection.tags.join(', ')}`, 70);
          }
          doc.moveDown(0.8);
        }
      });
      doc.moveDown(1);
    }

    // Notes with enhanced styling
    if (data.notes && data.notes.length > 0) {
      doc.fillColor('#e74c3c').fontSize(16).text('NOTES', { underline: true });
      doc.fillColor('#e74c3c').rect(50, doc.y + 2, doc.page.width - 100, 1).fill();
      doc.moveDown(0.8);

      data.notes.forEach((note, index) => {
        // Add page break if needed
        if (doc.y > 650) {
          doc.addPage();
        }

        // Note header with background
        const noteHeaderY = doc.y;
        doc.fillColor('#f8f9fa').rect(50, noteHeaderY - 5, doc.page.width - 100, 35).fill();
        doc.fillColor('#2c3e50').fontSize(13).font('Helvetica-Bold')
          .text(`${index + 1}. ${note.title}`, 60, noteHeaderY);
        
        doc.fillColor('#6c757d').fontSize(9).font('Helvetica')
          .text(`Collection: ${data.collections.find((c) => c.id === note.collection_id)?.name || 'Unknown'}`, 60)
          .text(`Created: ${formatDate(note.created_at)}`, 60);

        if (note.source_url) {
          doc.fillColor('#007bff').fontSize(9)
            .text(`Source: ${note.source_url}`, 60);
        }

        if (note.tags && note.tags.length > 0) {
          doc.fillColor('#8e44ad').fontSize(9)
            .text(`Tags: ${note.tags.join(', ')}`, 60);
        }

        doc.moveDown(0.5);
        
        // Content section
        doc.fillColor('#495057').fontSize(10).font('Helvetica-Bold')
          .text('Content:', 60);
        doc.fillColor('#212529').fontSize(11).font('Helvetica')
          .text(note.content, 60, doc.y + 5, { 
            width: doc.page.width - 120,
            align: 'left'
          });
        
        doc.moveDown(0.8);
        
        // Decorative separator
        doc.fillColor('#dee2e6').rect(50, doc.y, doc.page.width - 100, 3).fill();
        doc.moveDown(1);
      });
    }

    doc.end();

    return new Promise((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }

  /**
   * Main export function
   */
  async exportCollection(collectionId, format = 'json', recursive = false) {
    try {
      // Load file processing dependencies dynamically
      if (!createFile) {
        ({ createFile } = require('../../../../models/File'));
        ({ getStrategyFunctions } = require('../../../../server/services/Files/strategies'));
        ({ FileSources, FileContext } = require('librechat-data-provider'));
        PDFDocument = require('pdfkit');
      }

      const data = await this.getCollectionData(collectionId, recursive);

      let content;
      let filename;
      let mimeType;

      switch (format) {
        case 'json':
          content = this.generateJSON(data);
          filename = `collection-${data.collection.name.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.json`;
          mimeType = 'application/json';
          break;
        case 'xml':
          content = this.generateXML(data);
          filename = `collection-${data.collection.name.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.xml`;
          mimeType = 'application/xml';
          break;
        case 'pdf':
          content = await this.generatePDF(data);
          filename = `collection-${data.collection.name.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.pdf`;
          mimeType = 'application/pdf';
          break;
        default:
          throw new Error('Invalid export format. Supported formats: json, xml, pdf');
      }

      // Use LibreChat's file handling system to save the file
      const source = FileSources.local;
      const { saveBuffer } = getStrategyFunctions(source);
      const file_id = v4();
      const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');

      const filepath = await saveBuffer({
        userId: this.userId,
        fileName: filename,
        buffer: buffer,
      });

      // Create file record in database
      const fileRecord = await createFile(
        {
          user: this.userId,
          file_id,
          bytes: buffer.length,
          filepath,
          filename,
          context: FileContext.message_attachment,
          source,
          type: mimeType,
        },
        true,
      );

      return {
        success: true,
        file_id: fileRecord.file_id,
        filename: fileRecord.filename,
        download_url: fileRecord.filepath,
        format,
        size_bytes: fileRecord.bytes,
        collection_name: data.collection.name,
        total_notes: data.notes.length,
        total_collections: data.collections.length,
      };
    } catch (error) {
      logger.error('Export collection error:', error);
      throw error;
    }
  }

  async _call(args) {
    try {
      if (!this.userId) {
        return JSON.stringify({ error: 'User context not available' });
      }

      // Ensure database initialization complete
      await this.ready;

      const { action, collection_id, format, recursive } = args;

      switch (action) {
        case 'export_collection': {
          const result = await this.exportCollection(collection_id, format, recursive);
          return JSON.stringify({
            success: true,
            message: `Collection exported successfully as ${format.toUpperCase()}`,
            result,
          });
        }
        default:
          return JSON.stringify({ error: `Unknown action: ${action}` });
      }
    } catch (error) {
      logger.error('Collection Export tool error:', error);
      return JSON.stringify({
        error: error.message || 'An error occurred during export',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  }
}

module.exports = CollectionExport;
