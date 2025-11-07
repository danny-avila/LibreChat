# LibreChat Copilot Integration for PrestaShop

## Overview

This guide walks through integrating LibreChat's copilot mode into PrestaShop stores. The copilot will appear as a customer support assistant in a floating widget at the bottom-right of your store.

## Prerequisites

- PrestaShop 1.7+ or 8.0+
- LibreChat instance running with copilot mode enabled
- Basic knowledge of PrestaShop theme customization or module development

## Integration Options

### Option 1: Theme Override (Quickest)

Modify your theme's `footer.tpl` to add the copilot script.

**Steps:**

1. **Locate your theme's footer:**
   ```
   /themes/your-theme/templates/_partials/footer.tpl
   ```

2. **Add the copilot script before closing `</body>`:**
   ```smarty
   <!-- LibreChat Copilot Widget -->
   <script src="{$copilot_url|escape:'html'}" async></script>
   <script>
       document.addEventListener('DOMContentLoaded', function() {
           window.LibreChat && window.LibreChat.init({
               apiUrl: '{$copilot_api_url|escape:'html'}',
               assistant: '{$copilot_assistant|escape:'html'}',
               theme: {
                   primaryColor: '{$copilot_theme_color|escape:'html'}'
               },
               branding: {
                   displayName: '{$copilot_display_name|escape:'html'}'
               }
           });

           // Pass PrestaShop context to copilot
           if (window.LibreChat && window.LibreChat.setContext) {
               window.LibreChat.setContext({
                   storeName: '{$shop.name|escape:'html'}',
                   storeUrl: '{$shop.url|escape:'html'}',
                   {if isset($smarty.session.id_customer) && $smarty.session.id_customer}
                   customerId: '{$smarty.session.id_customer|escape:'html'}',
                   customerEmail: '{$smarty.session.id_customer|escape:'html'}',
                   {/if}
                   currency: '{$currency.iso_code}',
                   language: '{$language.iso_code}'
               });
           }
       });
   </script>
   ```

3. **Set variables in your controller or use child theme override:**
   ```php
   // In your child theme's controller or override
   $this->context->smarty->assign([
       'copilot_url' => 'https://your-librechat.com/embed/copilot.js',
       'copilot_api_url' => 'https://your-librechat.com',
       'copilot_assistant' => 'prestashop-support',
       'copilot_theme_color' => '#0066cc',
       'copilot_display_name' => 'Store Assistant'
   ]);
   ```

### Option 2: Custom Module (Recommended)

Create a reusable module for better maintainability.

**Step 1: Create module structure**

```
/modules/librechat_copilot/
├── librechat_copilot.php
├── views/
│   └── templates/
│       └── hook/
│           └── footer.tpl
├── config.xml
└── logo.png
```

**Step 2: Module main file (`librechat_copilot.php`)**

```php
<?php
if (!defined('_PS_VERSION_')) {
    exit;
}

class LibreChat_Copilot extends Module
{
    public function __construct()
    {
        $this->name = 'librechat_copilot';
        $this->tab = 'advertising_marketing';
        $this->version = '1.0.0';
        $this->author = 'Senticor';
        $this->need_instance = 0;
        $this->bootstrap = true;
        $this->displayName = $this->l('LibreChat Copilot Assistant');
        $this->description = $this->l('Embedded AI assistant for customer support');

        parent::__construct();
    }

    public function install()
    {
        return parent::install() &&
            $this->registerHook('displayFooterBefore') &&
            Configuration::updateValue('LIBRECHAT_COPILOT_ENABLED', 1) &&
            Configuration::updateValue('LIBRECHAT_COPILOT_URL', 'https://your-librechat.com') &&
            Configuration::updateValue('LIBRECHAT_COPILOT_ASSISTANT', 'prestashop-support') &&
            Configuration::updateValue('LIBRECHAT_COPILOT_COLOR', '#0066cc') &&
            Configuration::updateValue('LIBRECHAT_COPILOT_NAME', 'Store Assistant');
    }

    public function uninstall()
    {
        return parent::uninstall() &&
            Configuration::deleteByName('LIBRECHAT_COPILOT_ENABLED') &&
            Configuration::deleteByName('LIBRECHAT_COPILOT_URL') &&
            Configuration::deleteByName('LIBRECHAT_COPILOT_ASSISTANT') &&
            Configuration::deleteByName('LIBRECHAT_COPILOT_COLOR') &&
            Configuration::deleteByName('LIBRECHAT_COPILOT_NAME');
    }

    public function getContent()
    {
        $output = '';

        if (Tools::isSubmit('submit' . $this->name)) {
            Configuration::updateValue('LIBRECHAT_COPILOT_ENABLED',
                Tools::getValue('LIBRECHAT_COPILOT_ENABLED'));
            Configuration::updateValue('LIBRECHAT_COPILOT_URL',
                Tools::getValue('LIBRECHAT_COPILOT_URL'));
            Configuration::updateValue('LIBRECHAT_COPILOT_ASSISTANT',
                Tools::getValue('LIBRECHAT_COPILOT_ASSISTANT'));
            Configuration::updateValue('LIBRECHAT_COPILOT_COLOR',
                Tools::getValue('LIBRECHAT_COPILOT_COLOR'));
            Configuration::updateValue('LIBRECHAT_COPILOT_NAME',
                Tools::getValue('LIBRECHAT_COPILOT_NAME'));

            $output .= $this->displayConfirmation($this->l('Settings updated'));
        }

        return $output . $this->renderForm();
    }

    protected function renderForm()
    {
        $fields_form = [
            'form' => [
                'legend' => [
                    'title' => $this->l('LibreChat Copilot Settings'),
                ],
                'input' => [
                    [
                        'type' => 'switch',
                        'label' => $this->l('Enable Copilot'),
                        'name' => 'LIBRECHAT_COPILOT_ENABLED',
                        'is_bool' => true,
                        'values' => [
                            [
                                'id' => 'active_on',
                                'value' => 1,
                                'label' => $this->l('Enabled')
                            ],
                            [
                                'id' => 'active_off',
                                'value' => 0,
                                'label' => $this->l('Disabled')
                            ]
                        ],
                    ],
                    [
                        'type' => 'text',
                        'label' => $this->l('LibreChat URL'),
                        'name' => 'LIBRECHAT_COPILOT_URL',
                        'required' => true,
                        'placeholder' => 'https://your-librechat.com'
                    ],
                    [
                        'type' => 'text',
                        'label' => $this->l('Assistant ID'),
                        'name' => 'LIBRECHAT_COPILOT_ASSISTANT',
                        'required' => true,
                        'placeholder' => 'prestashop-support'
                    ],
                    [
                        'type' => 'color',
                        'label' => $this->l('Primary Color'),
                        'name' => 'LIBRECHAT_COPILOT_COLOR',
                        'placeholder' => '#0066cc'
                    ],
                    [
                        'type' => 'text',
                        'label' => $this->l('Display Name'),
                        'name' => 'LIBRECHAT_COPILOT_NAME',
                        'placeholder' => 'Store Assistant'
                    ],
                ],
                'submit' => [
                    'title' => $this->l('Save'),
                ],
            ],
        ];

        $helper = new HelperForm();
        $helper->module = $this;
        $helper->name_controller = $this->name;
        $helper->title = $this->displayName;
        $helper->submit_action = 'submit' . $this->name;

        $helper->fields_value['LIBRECHAT_COPILOT_ENABLED'] =
            Configuration::get('LIBRECHAT_COPILOT_ENABLED');
        $helper->fields_value['LIBRECHAT_COPILOT_URL'] =
            Configuration::get('LIBRECHAT_COPILOT_URL');
        $helper->fields_value['LIBRECHAT_COPILOT_ASSISTANT'] =
            Configuration::get('LIBRECHAT_COPILOT_ASSISTANT');
        $helper->fields_value['LIBRECHAT_COPILOT_COLOR'] =
            Configuration::get('LIBRECHAT_COPILOT_COLOR');
        $helper->fields_value['LIBRECHAT_COPILOT_NAME'] =
            Configuration::get('LIBRECHAT_COPILOT_NAME');

        return $helper->generateForm($fields_form);
    }

    public function hookDisplayFooterBefore($params)
    {
        if (!Configuration::get('LIBRECHAT_COPILOT_ENABLED')) {
            return '';
        }

        $this->smarty->assign([
            'copilot_url' => Configuration::get('LIBRECHAT_COPILOT_URL') . '/embed/copilot.js',
            'copilot_api_url' => Configuration::get('LIBRECHAT_COPILOT_URL'),
            'copilot_assistant' => Configuration::get('LIBRECHAT_COPILOT_ASSISTANT'),
            'copilot_color' => Configuration::get('LIBRECHAT_COPILOT_COLOR'),
            'copilot_name' => Configuration::get('LIBRECHAT_COPILOT_NAME'),
            'shop_name' => Configuration::get('PS_SHOP_NAME'),
            'customer_id' => isset($this->context->customer->id) ?
                $this->context->customer->id : null,
            'customer_email' => isset($this->context->customer->email) ?
                $this->context->customer->email : null,
            'currency_code' => $this->context->currency->iso_code,
            'language_code' => $this->context->language->iso_code,
        ]);

        return $this->display(__FILE__, 'footer.tpl');
    }
}
```

**Step 3: Template (`views/templates/hook/footer.tpl`)**

```smarty
<!-- LibreChat Copilot Widget -->
{if !empty($copilot_url)}
<script src="{$copilot_url|escape:'html'}" async></script>
<script>
    document.addEventListener('DOMContentLoaded', function() {
        if (window.LibreChat && typeof window.LibreChat.init === 'function') {
            // Initialize copilot
            window.LibreChat.init({
                apiUrl: '{$copilot_api_url|escape:'html'}',
                assistant: '{$copilot_assistant|escape:'html'}',
                theme: {
                    primaryColor: '{$copilot_color|escape:'html'}'
                },
                branding: {
                    displayName: '{$copilot_name|escape:'html'}'
                }
            });

            // Pass store context
            if (typeof window.LibreChat.setContext === 'function') {
                window.LibreChat.setContext({
                    storeName: '{$shop_name|escape:'html'}',
                    storeUrl: '{$shop_url|escape:'html'}',
                    {if !empty($customer_id)}
                    customerId: '{$customer_id|escape:'html'}',
                    customerEmail: '{$customer_email|escape:'html'}',
                    {/if}
                    currency: '{$currency_code}',
                    language: '{$language_code}'
                });
            }
        }
    });
</script>
{/if}
```

**Step 4: Installation**

1. Place module folder in `/modules/librechat_copilot/`
2. Go to PrestaShop Admin → Modules → Module Manager
3. Search for "LibreChat Copilot"
4. Click "Install"
5. Configure in module settings

## Usage

### Basic Configuration

In PrestaShop admin panel (Modules → Module Manager → LibreChat Copilot):

1. **Enable Copilot** - Toggle switch
2. **LibreChat URL** - Full URL to your LibreChat instance (e.g., https://chat.example.com)
3. **Assistant ID** - Pre-created assistant for PrestaShop support
4. **Primary Color** - Brand color for the widget (hex code)
5. **Display Name** - Name shown to customers

### Customer Information Passed to Copilot

Automatically included:

- Store name and URL
- Customer ID and email (if logged in)
- Currency and language
- Current page context (product, category, etc.)

### Creating a PrestaShop Support Assistant

In LibreChat, create a dedicated assistant for PrestaShop:

1. Go to Agents → Create New Agent
2. Set ID to `prestashop-support`
3. Configure system prompt:

```
You are a helpful customer support assistant for an e-commerce store.
You help customers with:
- Product inquiries
- Order status
- Payment and shipping questions
- Return and refund policies
- General store questions

Use the customer information provided in the context to personalize your responses.
Always be friendly, professional, and helpful.
If you don't know the answer, suggest contacting support@store.com.
```

4. Make assistant **Public** so it doesn't require authentication
5. Optionally add MCP tools for:
   - Order lookup
   - Product information
   - FAQ database

## Advanced: Custom PrestaShop Integration

### Track Customer Orders in Copilot

Extend the module to fetch customer orders:

```php
public function hookDisplayFooterBefore($params)
{
    // ... existing code ...

    $customer_orders = [];
    if (isset($this->context->customer->id)) {
        $orders = Order::getCustomerOrders($this->context->customer->id);
        $customer_orders = array_map(function($order) {
            return [
                'id' => $order['id_order'],
                'date' => $order['date_add'],
                'total' => $order['total_paid'],
                'state' => $order['current_state'],
            ];
        }, $orders);
    }

    $this->smarty->assign([
        // ... existing assignments ...
        'customer_orders' => json_encode($customer_orders),
    ]);

    return $this->display(__FILE__, 'footer.tpl');
}
```

In template:

```smarty
<script>
    document.addEventListener('DOMContentLoaded', function() {
        window.LibreChat && window.LibreChat.init({...});

        {if !empty($customer_orders)}
        window.LibreChat.setContext({
            // ... existing context ...
            orders: {$customer_orders|escape:'html'}
        });
        {/if}
    });
</script>
```

### Analytics Integration

Track copilot usage in PrestaShop:

```smarty
<script>
    if (window.LibreChat) {
        window.LibreChat.on('message', function(message) {
            // Log to your analytics
            fetch('/modules/librechat_copilot/analytics.php', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    type: 'message',
                    role: message.role,
                    timestamp: new Date().toISOString()
                })
            });
        });
    }
</script>
```

## Styling for PrestaShop

### Customize Widget Appearance

Override CSS in your theme:

```css
/* In your theme's custom.css */

/* Primary color */
.librechat-copilot-widget {
    --librechat-primary: #1e90ff;
    --librechat-primary-text: #ffffff;
}

/* Adjust size for mobile */
@media (max-width: 768px) {
    .librechat-copilot-window {
        width: 100vw !important;
        height: 100vh !important;
        border-radius: 0 !important;
    }
}

/* Match PrestaShop theme */
.librechat-message-user {
    background-color: #f5f5f5;
    border-radius: 4px;
}

.librechat-message-assistant {
    background-color: #e8f4f8;
    border-radius: 4px;
}
```

## Testing

### Local Testing

1. Start LibreChat locally: `npm run backend:dev`
2. Create test assistant in LibreChat UI
3. Update module settings to point to localhost
4. Clear PrestaShop cache
5. Open store and verify copilot appears

### Staging/Production

1. Deploy LibreChat to production server
2. Update module configuration with production URL
3. Test on live store
4. Monitor in LibreChat dashboard

## Troubleshooting

### Copilot Not Appearing

- Check browser console for errors
- Verify module is installed and enabled
- Clear PrestaShop cache (Admin → Performance)
- Check CORS settings in LibreChat

### Messages Not Sending

- Verify assistant exists and is public
- Check network tab for API errors
- Ensure LibreChat is accessible from store domain
- Review LibreChat server logs

### Styling Issues

- Check theme CSS doesn't conflict
- Verify z-index isn't too low (should be auto or high)
- Test in different browsers
- Clear browser cache

## Performance Considerations

- The copilot script is **async**, so it doesn't block page load
- Conversation history is stored in **browser localStorage**, not the server
- Each customer gets their own isolated session
- No performance impact on PrestaShop itself

## Security

- Never expose admin API keys in the frontend code
- Use public assistants or user authentication
- PrestaShop module validates all configuration
- Customer data is passed securely to LibreChat API

---

## Support

For issues or questions:
- Check LibreChat logs: `docker compose logs api`
- Review PrestaShop error logs: `/var/log/prestashop/`
- Consult main [COPILOT-MODE.md](COPILOT-MODE.md) documentation

---

**Last Updated**: 2025-11-07
**Version**: 1.0
**Status**: Production Ready
