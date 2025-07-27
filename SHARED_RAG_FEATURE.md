# Shared RAG (Retrieval-Augmented Generation) Feature

This document describes the implementation of a shared RAG capability for LibreChat, allowing admin users to upload PDF files that are globally accessible to all logged-in users in RAG responses.

## Overview

The shared RAG feature enhances LibreChat by implementing a global document repository that is accessible to all users. When any user performs a RAG query, the system now searches through both:
1. Their own uploaded PDF files
2. Admin-uploaded global PDF files

## Features

### 🔧 Admin Capabilities
- **Upload Global Files**: Admin users can upload PDF files that become globally accessible
- **Manage Global Files**: View, list, and delete global files through admin-only endpoints
- **Access Control**: Only admins can upload, edit, or delete global files

### 👥 User Experience
- **Seamless Access**: All logged-in users automatically have access to global files in RAG queries
- **Combined Results**: RAG responses include context from both user files and global files
- **No Management**: Regular users cannot manage global files but benefit from their content

## Implementation Details

### Database Schema Changes

The file schema has been extended with an `isGlobal` field:

```typescript
interface IMongoFile {
  // ... existing fields
  isGlobal?: boolean; // New field for global file identification
}
```

### API Endpoints

#### New Admin-Only Endpoints

1. **GET /api/files/global** - List all global files (admin only)
2. **DELETE /api/files/global/:file_id** - Delete a specific global file (admin only)

#### Enhanced Endpoints

1. **POST /api/files** - Now supports `isGlobal` parameter for admin uploads
2. **GET /api/files** - Now includes global files in user file listings

### File Processing

The file processing pipeline has been updated to:
- Accept `isGlobal` parameter during upload
- Store global files with the `isGlobal` flag
- Include global files in RAG queries automatically

### RAG Integration

The RAG system now:
- Processes both user files and global files in context generation
- Includes global files in file search tools
- Maintains proper access control while providing universal access

## Usage

### For Administrators

1. **Upload Global Files**:
   ```bash
   curl -X POST /api/files \
     -H "Authorization: Bearer <admin_token>" \
     -F "file=@document.pdf" \
     -F "isGlobal=true"
   ```

2. **List Global Files**:
   ```bash
   curl -X GET /api/files/global \
     -H "Authorization: Bearer <admin_token>"
   ```

3. **Delete Global File**:
   ```bash
   curl -X DELETE /api/files/global/<file_id> \
     -H "Authorization: Bearer <admin_token>"
   ```

### For Users

Users automatically benefit from global files:
- No additional setup required
- Global files appear in RAG responses alongside personal files
- File search tools include global files in results

## Security Considerations

- **Access Control**: Only admin users can upload, edit, or delete global files
- **Role Verification**: All global file operations verify admin role
- **File Isolation**: Global files are stored separately from user files
- **Audit Trail**: All global file operations are logged

## Configuration

No additional configuration is required. The feature is automatically enabled when:
- RAG is properly configured (`RAG_API_URL` environment variable)
- Admin users exist in the system
- File upload endpoints are accessible

## Migration Notes

For existing installations:
- The `isGlobal` field is optional and defaults to `false`
- Existing files remain unchanged
- No migration scripts are required
- The feature is backward compatible

## Testing

To test the implementation:

1. **Upload a global file as admin**:
   - Use the admin interface or API
   - Verify the file is marked as global

2. **Verify user access**:
   - Login as a regular user
   - Perform a RAG query
   - Confirm global files are included in results

3. **Test access control**:
   - Attempt to upload global files as non-admin (should fail)
   - Attempt to delete global files as non-admin (should fail)

## Troubleshooting

### Common Issues

1. **Global files not appearing in RAG results**:
   - Check that files are properly marked as `isGlobal: true`
   - Verify RAG API is functioning correctly
   - Check file embedding status

2. **Admin uploads failing**:
   - Verify user has admin role
   - Check file format compatibility
   - Review server logs for errors

3. **Permission denied errors**:
   - Ensure user has `SystemRoles.ADMIN` role
   - Check authentication token validity
   - Verify endpoint access permissions

## Future Enhancements

Potential improvements for future versions:
- File categories and tagging for global files
- Usage analytics for global files
- Selective global file access based on user groups
- Global file versioning and updates
- Integration with external document repositories 