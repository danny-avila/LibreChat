import fs from "node:fs";
import * as cognito from "aws-cdk-lib/aws-cognito";

function readAsset(path: string) {
  return fs.readFileSync(path, 'base64').toString();
}
export const assets: cognito.CfnManagedLoginBranding.AssetTypeProperty[] = [
  {
    category: "FORM_LOGO",
    colorMode: "LIGHT",
    extension: "PNG",
    bytes: readAsset(__dirname + "/assets/logo.png"),
  }
]
export const branding = {
  "components": {
    "secondaryButton": {
      "lightMode": {
        "hover": {
          "backgroundColor": "f2f8fdff",
          "borderColor": "033160ff",
          "textColor": "033160ff"
        },
        "defaults": {
          "backgroundColor": "ffffffff",
          "borderColor": "0972d3ff",
          "textColor": "0972d3ff"
        },
        "active": {
          "backgroundColor": "d3e7f9ff",
          "borderColor": "033160ff",
          "textColor": "033160ff"
        }
      },
      "darkMode": {
        "hover": {
          "backgroundColor": "192534ff",
          "borderColor": "89bdeeff",
          "textColor": "89bdeeff"
        },
        "defaults": {
          "backgroundColor": "0f1b2aff",
          "borderColor": "539fe5ff",
          "textColor": "539fe5ff"
        },
        "active": {
          "backgroundColor": "354150ff",
          "borderColor": "89bdeeff",
          "textColor": "89bdeeff"
        }
      }
    },
    "form": {
      "lightMode": {
        "backgroundColor": "ffffffff",
        "borderColor": "c6c6cdff"
      },
      "borderRadius": 8.0,
      "backgroundImage": {
        "enabled": false
      },
      "logo": {
        "location": "START",
        "position": "TOP",
        "enabled": true,
        "formInclusion": "OUT"
      },
      "darkMode": {
        "backgroundColor": "0f1b2aff",
        "borderColor": "424650ff"
      }
    },
    "alert": {
      "lightMode": {
        "error": {
          "backgroundColor": "fff7f7ff",
          "borderColor": "d91515ff"
        }
      },
      "borderRadius": 12.0,
      "darkMode": {
        "error": {
          "backgroundColor": "1a0000ff",
          "borderColor": "eb6f6fff"
        }
      }
    },
    "favicon": {
      "enabledTypes": [
        "ICO",
        "SVG"
      ]
    },
    "pageBackground": {
      "image": {
        "enabled": false
      },
      "lightMode": {
        "color": "ffffffff"
      },
      "darkMode": {
        "color": "0f1b2aff"
      }
    },
    "pageText": {
      "lightMode": {
        "bodyColor": "414d5cff",
        "headingColor": "000716ff",
        "descriptionColor": "414d5cff"
      },
      "darkMode": {
        "bodyColor": "b6bec9ff",
        "headingColor": "d1d5dbff",
        "descriptionColor": "b6bec9ff"
      }
    },
    "phoneNumberSelector": {
      "displayType": "TEXT"
    },
    "primaryButton": {
      "lightMode": {
        "hover": {
          "backgroundColor": "033160ff",
          "textColor": "ffffffff"
        },
        "defaults": {
          "backgroundColor": "0972d3ff",
          "textColor": "ffffffff"
        },
        "active": {
          "backgroundColor": "033160ff",
          "textColor": "ffffffff"
        },
        "disabled": {
          "backgroundColor": "ffffffff",
          "borderColor": "ffffffff"
        }
      },
      "darkMode": {
        "hover": {
          "backgroundColor": "89bdeeff",
          "textColor": "000716ff"
        },
        "defaults": {
          "backgroundColor": "539fe5ff",
          "textColor": "000716ff"
        },
        "active": {
          "backgroundColor": "539fe5ff",
          "textColor": "000716ff"
        },
        "disabled": {
          "backgroundColor": "ffffffff",
          "borderColor": "ffffffff"
        }
      }
    },
    "pageFooter": {
      "lightMode": {
        "borderColor": "d5dbdbff",
        "background": {
          "color": "fafafaff"
        }
      },
      "backgroundImage": {
        "enabled": false
      },
      "logo": {
        "location": "START",
        "enabled": false
      },
      "darkMode": {
        "borderColor": "424650ff",
        "background": {
          "color": "0f141aff"
        }
      }
    },
    "pageHeader": {
      "lightMode": {
        "borderColor": "d5dbdbff",
        "background": {
          "color": "fafafaff"
        }
      },
      "backgroundImage": {
        "enabled": false
      },
      "logo": {
        "location": "START",
        "enabled": false
      },
      "darkMode": {
        "borderColor": "424650ff",
        "background": {
          "color": "0f141aff"
        }
      }
    },
    "idpButton": {
      "standard": {
        "lightMode": {
          "hover": {
            "backgroundColor": "f2f8fdff",
            "borderColor": "033160ff",
            "textColor": "033160ff"
          },
          "defaults": {
            "backgroundColor": "ffffffff",
            "borderColor": "424650ff",
            "textColor": "424650ff"
          },
          "active": {
            "backgroundColor": "d3e7f9ff",
            "borderColor": "033160ff",
            "textColor": "033160ff"
          }
        },
        "darkMode": {
          "hover": {
            "backgroundColor": "192534ff",
            "borderColor": "89bdeeff",
            "textColor": "89bdeeff"
          },
          "defaults": {
            "backgroundColor": "0f1b2aff",
            "borderColor": "c6c6cdff",
            "textColor": "c6c6cdff"
          },
          "active": {
            "backgroundColor": "354150ff",
            "borderColor": "89bdeeff",
            "textColor": "89bdeeff"
          }
        }
      },
      "custom": {}
    }
  },
  "componentClasses": {
    "dropDown": {
      "lightMode": {
        "hover": {
          "itemBackgroundColor": "f4f4f4ff",
          "itemBorderColor": "7d8998ff",
          "itemTextColor": "000716ff"
        },
        "defaults": {
          "itemBackgroundColor": "ffffffff"
        },
        "match": {
          "itemBackgroundColor": "414d5cff",
          "itemTextColor": "0972d3ff"
        }
      },
      "borderRadius": 8.0,
      "darkMode": {
        "hover": {
          "itemBackgroundColor": "081120ff",
          "itemBorderColor": "5f6b7aff",
          "itemTextColor": "e9ebedff"
        },
        "defaults": {
          "itemBackgroundColor": "192534ff"
        },
        "match": {
          "itemBackgroundColor": "d1d5dbff",
          "itemTextColor": "89bdeeff"
        }
      }
    },
    "input": {
      "lightMode": {
        "defaults": {
          "backgroundColor": "ffffffff",
          "borderColor": "7d8998ff"
        },
        "placeholderColor": "5f6b7aff"
      },
      "borderRadius": 8.0,
      "darkMode": {
        "defaults": {
          "backgroundColor": "0f1b2aff",
          "borderColor": "5f6b7aff"
        },
        "placeholderColor": "8d99a8ff"
      }
    },
    "inputDescription": {
      "lightMode": {
        "textColor": "5f6b7aff"
      },
      "darkMode": {
        "textColor": "8d99a8ff"
      }
    },
    "buttons": {
      "borderRadius": 8.0
    },
    "optionControls": {
      "lightMode": {
        "defaults": {
          "backgroundColor": "ffffffff",
          "borderColor": "7d8998ff"
        },
        "selected": {
          "backgroundColor": "0972d3ff",
          "foregroundColor": "ffffffff"
        }
      },
      "darkMode": {
        "defaults": {
          "backgroundColor": "0f1b2aff",
          "borderColor": "7d8998ff"
        },
        "selected": {
          "backgroundColor": "539fe5ff",
          "foregroundColor": "000716ff"
        }
      }
    },
    "statusIndicator": {
      "lightMode": {
        "success": {
          "backgroundColor": "f2fcf3ff",
          "borderColor": "037f0cff",
          "indicatorColor": "037f0cff"
        },
        "pending": {
          "indicatorColor": "AAAAAAAA"
        },
        "warning": {
          "backgroundColor": "fffce9ff",
          "borderColor": "8d6605ff",
          "indicatorColor": "8d6605ff"
        },
        "error": {
          "backgroundColor": "fff7f7ff",
          "borderColor": "d91515ff",
          "indicatorColor": "d91515ff"
        }
      },
      "darkMode": {
        "success": {
          "backgroundColor": "001a02ff",
          "borderColor": "29ad32ff",
          "indicatorColor": "29ad32ff"
        },
        "pending": {
          "indicatorColor": "AAAAAAAA"
        },
        "warning": {
          "backgroundColor": "1d1906ff",
          "borderColor": "e0ca57ff",
          "indicatorColor": "e0ca57ff"
        },
        "error": {
          "backgroundColor": "1a0000ff",
          "borderColor": "eb6f6fff",
          "indicatorColor": "eb6f6fff"
        }
      }
    },
    "divider": {
      "lightMode": {
        "borderColor": "ebebf1ff"
      },
      "darkMode": {
        "borderColor": "232b37ff"
      }
    },
    "idpButtons": {
      "icons": {
        "enabled": true
      }
    },
    "focusState": {
      "lightMode": {
        "borderColor": "0972d3ff"
      },
      "darkMode": {
        "borderColor": "539fe5ff"
      }
    },
    "inputLabel": {
      "lightMode": {
        "textColor": "000716ff"
      },
      "darkMode": {
        "textColor": "d1d5dbff"
      }
    },
    "link": {
      "lightMode": {
        "hover": {
          "textColor": "033160ff"
        },
        "defaults": {
          "textColor": "0972d3ff"
        }
      },
      "darkMode": {
        "hover": {
          "textColor": "89bdeeff"
        },
        "defaults": {
          "textColor": "539fe5ff"
        }
      }
    }
  },
  "categories": {
    "form": {
      "sessionTimerDisplay": "NONE",
      "instructions": {
        "enabled": false
      },
      "languageSelector": {
        "enabled": false
      },
      "displayGraphics": true,
      "location": {
        "horizontal": "CENTER",
        "vertical": "CENTER"
      }
    },
    "auth": {
      "federation": {
        "interfaceStyle": "BUTTON_LIST",
        "order": []
      },
      "authMethodOrder": [
        [
          {
            "display": "BUTTON",
            "type": "FEDERATED"
          },
          {
            "display": "INPUT",
            "type": "USERNAME_PASSWORD"
          }
        ]
      ]
    },
    "global": {
      "colorSchemeMode": "LIGHT",
      "pageHeader": {
        "enabled": false
      },
      "pageFooter": {
        "enabled": false
      },
      "spacingDensity": "REGULAR"
    },
    "signUp": {
      "acceptanceElements": [
        {
          "enforcement": "NONE",
          "textKey": "en"
        }
      ]
    }
  }
}
