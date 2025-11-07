# LibreChat Copilot Integration for TYPO3

## Overview

This guide walks through integrating LibreChat's copilot mode into TYPO3 sites. The copilot will appear as an intelligent assistant in a floating widget, enhancing user engagement and providing instant support.

## Prerequisites

- TYPO3 10 LTS or 11 LTS (or 12+)
- LibreChat instance running with copilot mode enabled
- Basic TYPO3 extension development knowledge (or use the pre-built extension)

## Integration Options

### Option 1: Page TSConfig (Quickest)

Add to your page or site-wide TSConfig:

```typoscript
# In Page TSConfig or Constants:
plugin.librechat_copilot {
    enabled = 1
    apiUrl = https://your-librechat.com
    assistant = typo3-support
    theme.primaryColor = #0066cc
    branding.displayName = TYPO3 Assistant
}

# Optional: Restrict to specific pages
plugin.librechat_copilot.showOnPages = /products/*,/services/*
```

Then add the following to your `page.setup` or `EXT:fluid_styled_content/Configuration/TypoScript/setup.typoscript`:

```typoscript
page.footerData.999 = USER
page.footerData.999 {
    userFunc = Senticor\LibreChat\Copilot->renderWidget
}
```

### Option 2: Custom TYPO3 Extension (Recommended)

Create a reusable extension for better maintainability.

**Extension Structure:**

```
ext_librechat_copilot/
├── Configuration/
│   ├── TypoScript/
│   │   ├── setup.typoscript
│   │   └── constants.typoscript
│   ├── TCA/
│   │   └── tx_librechat_copilot_settings.php
│   └── FluidStyled/
│       └── setup.typoscript
├── Classes/
│   ├── Controller/
│   │   └── CopilotController.php
│   └── ViewHelpers/
│       └── RenderCopilotViewHelper.php
├── Resources/
│   ├── Private/
│   │   ├── Partials/
│   │   │   └── Copilot/Widget.html
│   │   ├── Layouts/
│   │   └── Templates/
│   └── Public/
│       ├── Icons/
│       └── Css/
├── ext_emconf.php
└── ext_tables.sql
```

**Step 1: Extension Configuration (`ext_emconf.php`)**

```php
<?php

declare(strict_types=1);

$EM_CONF[$_EXTKEY] = [
    'title' => 'LibreChat Copilot Assistant',
    'description' => 'Embedded AI assistant for TYPO3 sites',
    'category' => 'plugin',
    'author' => 'Senticor',
    'author_email' => 'info@example.com',
    'version' => '1.0.0',
    'state' => 'stable',
    'constraints' => [
        'depends' => [
            'typo3' => '10.4.0-12.4.99',
            'fluid' => '10.4.0-12.4.99',
            'frontend' => '10.4.0-12.4.99'
        ],
        'conflicts' => [],
        'suggests' => []
    ],
];
```

**Step 2: TypoScript Setup (`Configuration/TypoScript/setup.typoscript`)**

```typoscript
plugin.librechat_copilot {
    view {
        templateRootPaths.0 = EXT:ext_librechat_copilot/Resources/Private/Templates/
        partialRootPaths.0 = EXT:ext_librechat_copilot/Resources/Private/Partials/
        layoutRootPaths.0 = EXT:ext_librechat_copilot/Resources/Private/Layouts/
    }

    settings {
        enabled = 1
        apiUrl = {$plugin.librechat_copilot.settings.apiUrl}
        assistantId = {$plugin.librechat_copilot.settings.assistantId}
        displayName = {$plugin.librechat_copilot.settings.displayName}
        theme {
            primaryColor = {$plugin.librechat_copilot.settings.theme.primaryColor}
            position = {$plugin.librechat_copilot.settings.position}
        }
    }
}

# Register hook for footer rendering
page.footerData.999 = USER
page.footerData.999 {
    userFunc = TYPO3\CMS\Extbase\Core\Bootstrap->run
    extensionName = ExtLibrechtCopilot
    controllerName = Copilot
    actionName = render
    pluginName = Widget
    vendorName = Senticor
}
```

**Step 3: TypoScript Constants (`Configuration/TypoScript/constants.typoscript`)**

```typoscript
plugin.librechat_copilot {
    settings {
        # LibreChat API URL
        apiUrl = https://your-librechat.com

        # Assistant identifier (must exist in LibreChat)
        assistantId = typo3-support

        # Display name for the widget
        displayName = TYPO3 Assistant

        # Theme configuration
        theme {
            primaryColor = #0066cc
            position = bottom-right
        }

        # Pages to show copilot on (empty = all)
        showOnPages =

        # Pages to hide copilot on
        hideOnPages =
    }
}
```

**Step 4: Controller (`Classes/Controller/CopilotController.php`)**

```php
<?php

declare(strict_types=1);

namespace Senticor\ExtLibrechtCopilot\Controller;

use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Extbase\Configuration\ConfigurationManager;
use TYPO3\CMS\Extbase\Configuration\ConfigurationManagerInterface;
use TYPO3\CMS\Extbase\Mvc\Controller\ActionController;
use TYPO3\CMS\Frontend\Controller\TypoScriptFrontendController;
use TYPO3Fluid\Fluid\View\StandaloneView;

class CopilotController extends ActionController
{
    private ConfigurationManager $configurationManager;

    public function __construct(ConfigurationManager $configurationManager)
    {
        $this->configurationManager = $configurationManager;
    }

    public function renderAction(): string
    {
        $setup = $this->configurationManager->getConfiguration(
            ConfigurationManagerInterface::CONFIGURATION_TYPE_FULL_TYPOSCRIPT
        );

        if (!$setup['plugin.']['librechat_copilot.']['settings.']['enabled'] ?? false) {
            return '';
        }

        $view = GeneralUtility::makeInstance(StandaloneView::class);
        $view->setTemplatePathAndFilename(
            GeneralUtility::getFileAbsFileName(
                'EXT:ext_librechat_copilot/Resources/Private/Templates/Copilot/Widget.html'
            )
        );

        // Get TYPO3 frontend controller
        $tsfe = $GLOBALS['TSFE'] ?? null;

        $context = [
            'apiUrl' => $setup['plugin.']['librechat_copilot.']['settings.']['apiUrl'],
            'assistantId' => $setup['plugin.']['librechat_copilot.']['settings.']['assistantId'],
            'displayName' => $setup['plugin.']['librechat_copilot.']['settings.']['displayName'],
            'primaryColor' => $setup['plugin.']['librechat_copilot.']['settings.']['theme.']['primaryColor'],
            'position' => $setup['plugin.']['librechat_copilot.']['settings.']['theme.']['position'],
            'siteUrl' => $tsfe ? $tsfe->baseUrl : GeneralUtility::getIndpEnv('TYPO3_SITE_URL'),
            'pageId' => $tsfe ? $tsfe->id : 0,
            'pageTitle' => $tsfe ? $tsfe->page['title'] ?? '' : '',
            'language' => $tsfe ? $tsfe->lang ?? 'en' : 'en',
            'userId' => $GLOBALS['TSFE']->fe_user->user['uid'] ?? null,
            'userEmail' => $GLOBALS['TSFE']->fe_user->user['email'] ?? null,
        ];

        $view->assignMultiple($context);
        return $view->render();
    }
}
```

**Step 5: Fluid Template (`Resources/Private/Templates/Copilot/Widget.html`)**

```html
<!-- LibreChat Copilot Widget -->
<f:if condition="{apiUrl}">
    <script src="{apiUrl}/embed/copilot.js" async="async"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            if (window.LibreChat && typeof window.LibreChat.init === 'function') {
                // Initialize copilot
                window.LibreChat.init({
                    apiUrl: '{apiUrl}',
                    assistant: '{assistantId}',
                    theme: {
                        primaryColor: '{primaryColor}'
                    },
                    branding: {
                        displayName: '{displayName}'
                    }
                });

                // Pass TYPO3 context
                if (typeof window.LibreChat.setContext === 'function') {
                    var context = {
                        siteUrl: '{siteUrl}',
                        pageId: {pageId},
                        pageTitle: '{pageTitle}',
                        language: '{language}'
                    };

                    <f:if condition="{userId}">
                        context.userId = '{userId}';
                        context.userEmail = '{userEmail}';
                    </f:if>

                    window.LibreChat.setContext(context);
                }
            }
        });
    </script>
</f:if>
```

## Installation & Setup

### Using Pre-built Extension

1. **Download** the extension from the TYPO3 Extension Repository (TER)
2. **Unzip** to `typo3conf/ext/ext_librechat_copilot/`
3. **Install** via TYPO3 Admin Tools → Extensions
4. **Configure** via Constant Editor or Site Configuration

### Using Git Clone

```bash
cd typo3conf/ext/
git clone https://github.com/your-org/ext-librechat-copilot.git ext_librechat_copilot
cd ext_librechat_copilot
npm install  # if using any JavaScript
```

### Site Configuration (Recommended for TYPO3 10.4+)

Edit your site's `config.yaml`:

```yaml
rootPageId: 1

languages:
  -
    title: English
    enabled: true
    languageId: 0
    base: /
    locale: en_US.UTF-8

settings:
  librechat:
    apiUrl: 'https://your-librechat.com'
    assistantId: 'typo3-support'
    displayName: 'TYPO3 Assistant'
    theme:
      primaryColor: '#0066cc'
```

## Usage

### Admin Configuration

Navigate to **Admin Tools** → **Settings** → **LibreChat Copilot**:

1. **Enable Copilot** - Toggle
2. **API URL** - Full URL to LibreChat
3. **Assistant ID** - Identifier of the assistant
4. **Display Name** - Name shown in widget
5. **Primary Color** - Brand color (hex)
6. **Position** - bottom-right (default) or other positions
7. **Show on Pages** - Page paths to display (empty = all)
8. **Hide on Pages** - Page paths to hide on

### Content Element Integration

Create a custom Content Element Type for more advanced control:

```php
// Register content element
$GLOBALS['TCA']['tt_content']['types']['librechat_copilot'] = [
    'showitem' => 'CType, --div--; LLL:EXT:core/Resources/Private/Language/locallang_tca.xlf:sys_category.tabs.category, sys_category',
];

$GLOBALS['TCA']['tt_content']['columns']['CType']['config']['items']['librechat_copilot'] = [
    'label' => 'LibreChat Copilot',
    'value' => 'librechat_copilot',
    'icon' => 'EXT:ext_librechat_copilot/Resources/Public/Icons/copilot.svg',
];
```

### Creating a TYPO3 Support Assistant

In LibreChat, create a dedicated assistant for TYPO3:

1. Go to Agents → Create New Agent
2. Set ID to `typo3-support`
3. Configure system prompt:

```
You are a helpful TYPO3 assistant for content editors and site administrators.
You help with:
- Content editing and publishing
- Page management and hierarchy
- User and group management
- Extension installation and configuration
- Site configuration
- Backend workflow questions

Use the page context and user information provided to give relevant assistance.
Always provide clear, step-by-step instructions for TYPO3 tasks.
If something is outside your knowledge, suggest checking the official TYPO3 documentation.
```

4. Make assistant **Public** or restrict to authenticated users
5. Optionally add MCP tools for:
   - Page lookup
   - User information
   - Extension catalog
   - TYPO3 documentation search

## Advanced Features

### Integration with TYPO3 Plugins

Pass plugin-specific context to the copilot:

```php
// In your plugin controller
$this->view->assign('copilotContext', [
    'pluginType' => 'shop',
    'productId' => $productId,
    'categoryId' => $categoryId,
    'currentPrice' => $product['price'],
]);
```

In Fluid template:

```html
<script>
    if (window.LibreChat && window.LibreChat.setContext) {
        window.LibreChat.setContext({
            pluginType: '{copilotContext.pluginType}',
            <f:if condition="{copilotContext.productId}">
                productId: '{copilotContext.productId}',
            </f:if>
            <f:if condition="{copilotContext.categoryId}">
                categoryId: '{copilotContext.categoryId}',
                currentPrice: '{copilotContext.currentPrice}'
            </f:if>
        });
    }
</script>
```

### MCP Tool for TYPO3 Documentation

Create an MCP server that allows the copilot to search official TYPO3 documentation:

```javascript
// MCP tool configuration in librechat.yaml
mcpServers:
  typo3-docs:
    type: stdio
    command: node
    args:
      - /path/to/typo3-docs-mcp.js
    timeout: 30000
```

The tool can then search and retrieve TYPO3 documentation pages based on queries.

### Analytics Integration

Track copilot usage in TYPO3:

```php
// In hook or extension
class CopilotAnalyticsHook {
    public function registerHook() {
        $GLOBALS['TYPO3_CONF_VARS']['SC_OPTIONS']['TYPO3\CMS\Frontend\Middleware/FrontendUserAuthenticator'][]
            = CopilotAnalyticsMiddleware::class . '->logCopilotUsage';
    }
}
```

## Styling & Customization

### TypoScript Override

In your site's TypoScript:

```typoscript
plugin.librechat_copilot {
    settings {
        theme {
            primaryColor = #ff6b35
            position = bottom-left
        }
    }
}
```

### CSS Customization

Create a custom CSS file and include in your site:

```css
/* Custom TYPO3 copilot styling */
.librechat-copilot-widget {
    --librechat-primary: #ff6b35;
    --librechat-border-radius: 8px;
    --librechat-font-family: 'Helvetica Neue', Arial, sans-serif;
}

@media (max-width: 768px) {
    .librechat-copilot-window {
        width: 100vw !important;
        height: 100vh !important;
        border-radius: 0 !important;
    }
}
```

## Testing

### Local Testing

1. **Set up TYPO3 locally** with your extension installed
2. **Configure** the extension with local LibreChat URL
3. **Create test assistant** in LibreChat
4. **Clear TYPO3 caches** (Admin Tools → Flush Caches)
5. **View frontend** and verify copilot appears

### Staging/Production

```bash
# Deploy extension
rsync -av ext_librechat_copilot/ server:/var/www/html/typo3conf/ext/

# Clear TYPO3 caches on server
php typo3/sysext/core/bin/typo3 cache:flush

# Test on live site
```

## Troubleshooting

### Copilot Not Appearing

1. **Verify extension is installed**: Admin Tools → Extensions
2. **Check TypoScript is loaded**: Admin Tools → TypoScript → Analyzer
3. **Verify constant values**: Admin Tools → Constant Editor
4. **Clear all caches**: Admin Tools → Flush Caches
5. **Check JavaScript console** for errors

### Messages Not Sending

- Verify assistant exists and is public in LibreChat
- Check LibreChat API is accessible from your site's domain
- Review network tab for API errors
- Check LibreChat server logs

### Styling Issues

- Ensure extension CSS is loaded
- Check for conflicting TYPO3 CSS
- Verify z-index isn't blocked by other elements
- Test in incognito mode (browser cache)

### Performance

- Copilot script is **async** - no page load impact
- Consider using **Lazy Loading** for the widget on large sites
- Monitor LibreChat API performance
- Use CDN for static assets

## Security Considerations

### Protecting Admin Content

If your copilot should only be available to authenticated users:

```typoscript
plugin.librechat_copilot.settings.requireAuth = 1
```

### CORS Configuration

Configure allowed domains in LibreChat `.env`:

```env
COPILOT_ALLOWED_ORIGINS=["https://your-typo3-site.com"]
```

### API Key Management

- Never expose LibreChat admin keys in frontend code
- Use public assistants when possible
- Implement user authentication for private assistants
- Use HTTPS for all communications

## Performance Monitoring

### TYPO3 Slowlog Integration

Monitor copilot impact on site performance:

```php
// Log copilot initialization time
if (isset($GLOBALS['TYPO3_REQUESTTYPE']) && $GLOBALS['TYPO3_REQUESTTYPE'] & TYPO3_REQUESTTYPE_FE) {
    $GLOBALS['TYPO3_DEBUG_LOG'][] = [
        'LibreChat Copilot widget loaded',
        'Performance'
    ];
}
```

### CDN Configuration

For faster script delivery, host the copilot script on a CDN:

```typoscript
plugin.librechat_copilot.settings.scriptUrl = https://cdn.example.com/copilot.js
```

## Maintenance & Updates

### Updating the Extension

```bash
cd typo3conf/ext/ext_librechat_copilot/
git pull origin main
```

Then clear TYPO3 caches and test.

### Checking LibreChat Updates

Keep your LibreChat instance updated for bug fixes and new features:

```bash
cd /path/to/librechat
git pull
docker compose up -d
```

## Support & Documentation

- **TYPO3 Documentation**: https://docs.typo3.org/
- **LibreChat Documentation**: See main [COPILOT-MODE.md](COPILOT-MODE.md)
- **Extension Repository**: https://extensions.typo3.org/

---

**Last Updated**: 2025-11-07
**Version**: 1.0
**Status**: Production Ready
**TYPO3 Compatibility**: 10 LTS, 11 LTS, 12 LTS
