# Playbook admin — Consommation Vermeer Chat V1

Procédure d'activation de la balance LibreChat et requêtes MongoDB prêtes à l'emploi pour le pilotage admin de la consommation utilisateur.

- **Audience** : admins Vermeer Chat (Loïse, Antoine).
- **Périmètre** : V1 (3 juin 2026). UI dédiée non livrée — voir §6.
- **Date de création** : 2026-05-28.
- **Dernière mise à jour** : 2026-05-28.

---

## 1. Objectif et audience

Permettre aux admins de répondre, sans UI dédiée et sans développement custom, à des questions opérationnelles courantes :

- « Qui consomme le plus ce mois ? »
- « Sophie BETC a dépensé combien depuis le 1ᵉʳ mai, ventilé par modèle ? »
- « Quelle BU coûte le plus ? »
- « Quels modèles consomment le plus de budget (Claude Opus vs Sonnet vs GPT-5.2) ? »

Le playbook s'appuie sur la collection `transactions` de MongoDB, alimentée nativement par LibreChat dès que `transactions.enabled` est vrai (défaut). Aucune UI n'est nécessaire : un copier-coller dans `mongosh` ou MongoDB Compass suffit.

## 2. Prérequis

### Accès à la base MongoDB

- URI Vermeer Chat (cf. `.env`) : `mongodb://127.0.0.1:27017/LibreChat` en local. En staging/prod, demander l'URI à Oussama.
- Niveau d'accès recommandé : **read** pour les requêtes de ce playbook ; **read + write** uniquement si on rechargera manuellement des soldes (§5).

### Outils

Deux options équivalentes au choix :

- **`mongosh`** (CLI) — installé d'office sur le poste Loïse (cf. session du 27 mai). Connexion :
  ```bash
  mongosh "mongodb://127.0.0.1:27017/LibreChat"
  ```
- **MongoDB Compass** (GUI) — interface graphique, plus confortable pour lire les résultats sous forme de tableau. Connecter à `mongodb://127.0.0.1:27017`, naviguer dans la base `LibreChat`, ouvrir l'onglet « Aggregations » sur la collection visée.

### Collections clés

| Collection | Rôle |
|---|---|
| `transactions` | 1 document par appel modèle (input prompt, completion, cache). Champs : `user`, `model`, `tokenType` (`prompt`/`completion`/`credits`), `tokenValue`, `rawAmount`, `rate`, `createdAt`, `tenantId`. |
| `balances` | 1 document par user. Champs : `user`, `tokenCredits`, `autoRefillEnabled`, `lastRefill`, `tenantId`. |
| `users` | Profil utilisateur (email, name, role, tenantId). |

### Unités

- `tokenValue` et `tokenCredits` sont en **mills** : **1 000 000 unités = 1 USD**.
- Les transactions de consommation (prompt + completion) stockent `tokenValue` **négatif** ; les crédits/refills positifs. Toutes les requêtes ci-dessous appliquent `$abs` pour obtenir des USD positifs.

---

## 3. Activation de la balance en V1

### 3.1 Bloc yaml à appliquer

À décommenter dans `librechat.yaml` (autour de la ligne 107) :

```yaml
balance:
  enabled: true
  startBalance: 10000000   # 10M crédits ≈ 10 USD par user au démarrage
  autoRefillEnabled: false # V1 : rechargement manuel via set-balance pour visibilité totale
```

> **Pas besoin** d'ajouter `transactions: enabled: true` : c'est le **défaut natif** LibreChat, et `balance.enabled: true` le **force** quelle que soit la valeur passée (le solde a besoin de l'historique).

### 3.2 Procédure d'application locale (poste Loïse)

1. Couper le backend en cours (Ctrl-C dans le terminal `npm run backend:dev`).
2. Éditer `librechat.yaml` à la racine du repo, décommenter le bloc ci-dessus.
3. Relancer : `npm run backend:dev`.
4. **Surveiller les premières lignes de log** : LibreChat est en **fail-fast yaml** — toute erreur de validation fait sortir le process en code 1. Si crash, revert immédiat (Ctrl-Z dans l'éditeur ou git stash sur l'éditeur n'a pas d'effet ici puisque le yaml est gitignoré → garder une copie de sauvegarde du yaml avant édition).
5. Test rapide : ouvrir l'UI, envoyer un message, vérifier dans Settings → Balance que le solde se décrémente.

### 3.3 Déploiement staging/prod — coordination ops

⚠️ **`librechat.yaml` est gitignoré** (`.gitignore:75`). Les modifications locales ne se propagent **pas** par commit. Pour le déploiement staging/prod du 3 juin :

- À coordonner avec **Antoine** (validation archi) et **Oussama** (mécanique de déploiement).
- Le yaml de chaque environnement doit recevoir le même bloc `balance` ci-dessus.
- Procédure attendue (à confirmer avec Oussama) : édition du yaml monté en volume Docker, redémarrage du conteneur backend, vérification logs.

### 3.4 Migration users existants — procédure à suivre avant prod

Risque connu (cf. CLAUDE.md §11) : à chaque login, **le solde se réaligne sur `startBalance`** si certaines conditions sont remplies. Activer la balance avec `startBalance: 10000000` alors qu'on importe une base prod existante **risque d'écraser les soldes pré-existants** au prochain login de chaque user.

Procédure recommandée pour le déploiement prod :

1. **Importer la base prod existante** dans Vermeer Chat (collections `users`, `conversations`, `messages` au minimum).
2. **Activer la balance avec `startBalance: 0`** initialement dans le yaml prod.
3. **Redémarrer le backend** et vérifier qu'aucune erreur n'apparaît.
4. **Initialiser les soldes ciblés** via `set-balance` pour chaque user à doter (boucle scriptée recommandée) :
   ```bash
   npm run set-balance loise.toscer@proseonpixels.com 10000000
   npm run set-balance antoine@proseonpixels.com 10000000
   npm run set-balance sophie.dupont@betc.com 10000000
   # ... etc. pour chaque user
   ```
   Alternative scriptée si la liste est longue :
   ```bash
   for email in $(cat users.txt); do npm run set-balance "$email" 10000000; done
   ```
5. **Une fois tous les soldes initialisés**, on peut éventuellement passer `startBalance` à `10000000` dans le yaml pour que les **nouveaux** users inscrits ensuite démarrent à 10 USD (à valider avec Antoine).

> À tester sur staging avec un sous-ensemble représentatif d'users avant la bascule prod.

---

## 4. Le playbook — 5 requêtes admin

### Préambule technique rapide

Les requêtes utilisent le **pipeline d'agrégation MongoDB** — une chaîne d'étapes (`$match`, `$group`, `$lookup`, `$project`, `$sort`) appliquées en séquence sur une collection.

- `$match` : filtre les documents (équivalent SQL `WHERE`).
- `$group` : regroupe et calcule des sommes/comptes (équivalent SQL `GROUP BY`).
- `$lookup` : jointure avec une autre collection.
- `$project` : sélectionne et renomme les champs de sortie.
- `$sort` / `$limit` : tri et limitation.

**mongosh vs Compass** :
- `mongosh` : copier-coller la requête, résultat en JSON dans le terminal.
- Compass : onglet Aggregations, coller le contenu du tableau (entre `[` et `]`), résultat en tableau cliquable.

Les `transactions` sont **alimentées par défaut** dès qu'on parle à un modèle, indépendamment de la balance. Les requêtes ci-dessous fonctionnent donc **dès aujourd'hui**, même avant l'activation §3.

---

### 4.1 — Top consommateurs sur les 30 derniers jours

**Cas d'usage** : « Qui consomme le plus ce mois ? Liste des 20 premiers users, classés par USD dépensés. »

```javascript
db.transactions.aggregate([
  {
    $match: {
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      tokenType: { $in: ['prompt', 'completion'] }
    }
  },
  {
    $group: {
      _id: '$user',
      totalCost: { $sum: { $abs: '$tokenValue' } },
      totalTokens: { $sum: { $abs: '$rawAmount' } },
      txCount: { $sum: 1 }
    }
  },
  {
    $lookup: {
      from: 'users',
      localField: '_id',
      foreignField: '_id',
      as: 'user'
    }
  },
  { $unwind: '$user' },
  {
    $project: {
      _id: 0,
      email: '$user.email',
      name: '$user.name',
      totalUSD: { $round: [{ $divide: ['$totalCost', 1000000] }, 4] },
      totalTokens: 1,
      txCount: 1
    }
  },
  { $sort: { totalUSD: -1 } },
  { $limit: 20 }
])
```

**Paramètres ajustables** :
- Période : changer `30 * 24 * 60 * 60 * 1000` (ms) pour étendre/réduire.
- Top : changer `$limit: 20` pour afficher plus/moins de users.

**Résultat attendu** (extrait) :
```json
[
  { "email": "sophie.dupont@betc.com", "name": "Sophie Dupont", "totalUSD": 12.4521, "totalTokens": 1_234_567, "txCount": 184 },
  { "email": "marc.l@proseonpixels.com", "name": "Marc L.", "totalUSD": 8.9112, "totalTokens": 890_440, "txCount": 121 },
  ...
]
```

---

### 4.2 — Détail d'un user spécifique sur une période

**Cas d'usage** : « Sophie a consommé combien sur mai, ventilé par modèle et par type de token (prompt/completion) ? »

**Étape 1 — récupérer l'`_id` du user** :

```javascript
db.users.findOne(
  { email: 'sophie.dupont@betc.com' },
  { _id: 1, email: 1, name: 1 }
)
```
Copier l'`ObjectId('...')` retourné.

**Étape 2 — agrégation** (remplacer `REMPLACE_PAR_LID` par l'ObjectId copié) :

```javascript
db.transactions.aggregate([
  {
    $match: {
      user: ObjectId('REMPLACE_PAR_LID'),
      createdAt: {
        $gte: ISODate('2026-05-01T00:00:00Z'),
        $lt:  ISODate('2026-06-01T00:00:00Z')
      },
      tokenType: { $in: ['prompt', 'completion'] }
    }
  },
  {
    $group: {
      _id: { model: '$model', tokenType: '$tokenType' },
      totalCost: { $sum: { $abs: '$tokenValue' } },
      totalTokens: { $sum: { $abs: '$rawAmount' } },
      txCount: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 0,
      model: '$_id.model',
      tokenType: '$_id.tokenType',
      totalUSD: { $round: [{ $divide: ['$totalCost', 1000000] }, 4] },
      totalTokens: 1,
      txCount: 1
    }
  },
  { $sort: { totalUSD: -1 } }
])
```

**Paramètres ajustables** :
- Email (étape 1) : `sophie.dupont@betc.com`.
- Bornes de période (étape 2) : `$gte` et `$lt` au format ISO 8601 UTC.

---

### 4.3 — Total mensuel par BU

**Cas d'usage** : « Quelle BU a coûté le plus ce mois ? »

LibreChat propose deux mécanismes possibles pour identifier la BU : le champ `tenantId` (si configuré) ou le **domaine email** du user (fallback pragmatique, ex. `@betc.com` vs `@proseonpixels.com`).

**Variante A — par `tenantId`** (si renseigné) :

```javascript
db.transactions.aggregate([
  {
    $match: {
      createdAt: {
        $gte: ISODate('2026-05-01T00:00:00Z'),
        $lt:  ISODate('2026-06-01T00:00:00Z')
      },
      tokenType: { $in: ['prompt', 'completion'] }
    }
  },
  {
    $group: {
      _id: '$tenantId',
      totalCost: { $sum: { $abs: '$tokenValue' } },
      users: { $addToSet: '$user' }
    }
  },
  {
    $project: {
      _id: 0,
      tenantId: '$_id',
      totalUSD: { $round: [{ $divide: ['$totalCost', 1000000] }, 4] },
      userCount: { $size: '$users' }
    }
  },
  { $sort: { totalUSD: -1 } }
])
```

**Variante B — par domaine email** (fallback si `tenantId` non renseigné en V1) :

```javascript
db.transactions.aggregate([
  {
    $match: {
      createdAt: {
        $gte: ISODate('2026-05-01T00:00:00Z'),
        $lt:  ISODate('2026-06-01T00:00:00Z')
      },
      tokenType: { $in: ['prompt', 'completion'] }
    }
  },
  {
    $lookup: {
      from: 'users',
      localField: 'user',
      foreignField: '_id',
      as: 'userDoc'
    }
  },
  { $unwind: '$userDoc' },
  {
    $addFields: {
      domain: { $arrayElemAt: [{ $split: ['$userDoc.email', '@'] }, 1] }
    }
  },
  {
    $group: {
      _id: '$domain',
      totalCost: { $sum: { $abs: '$tokenValue' } },
      users: { $addToSet: '$user' }
    }
  },
  {
    $project: {
      _id: 0,
      domain: '$_id',
      totalUSD: { $round: [{ $divide: ['$totalCost', 1000000] }, 4] },
      userCount: { $size: '$users' }
    }
  },
  { $sort: { totalUSD: -1 } }
])
```

> Choix recommandé V1 : **Variante B** tant que la stratégie groupes BETC/POP n'est pas câblée. Bascule sur la Variante A en V2 quand l'Admin Panel ClickHouse aura peuplé les `tenantId`.

---

### 4.4 — Solde restant + USD consommé pour tous les users

**Cas d'usage** : équivalent de `npm run list-balances`, enrichi d'une colonne « USD consommé total » par user.

```javascript
db.balances.aggregate([
  {
    $lookup: {
      from: 'users',
      localField: 'user',
      foreignField: '_id',
      as: 'userDoc'
    }
  },
  { $unwind: '$userDoc' },
  {
    $lookup: {
      from: 'transactions',
      let: { uid: '$user' },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ['$user', '$$uid'] },
            tokenType: { $in: ['prompt', 'completion'] }
          }
        },
        {
          $group: {
            _id: null,
            spent: { $sum: { $abs: '$tokenValue' } }
          }
        }
      ],
      as: 'spend'
    }
  },
  {
    $project: {
      _id: 0,
      email: '$userDoc.email',
      name: '$userDoc.name',
      balanceUSD: { $round: [{ $divide: ['$tokenCredits', 1000000] }, 4] },
      spentUSD: {
        $round: [{
          $divide: [
            { $ifNull: [{ $arrayElemAt: ['$spend.spent', 0] }, 0] },
            1000000
          ]
        }, 4]
      }
    }
  },
  { $sort: { spentUSD: -1 } }
])
```

> Note : cette requête ne renvoie que les users qui ont **un document Balance** (donc qui ont déjà été dotés). Pour voir aussi les users sans Balance, partir de `db.users.aggregate([...])` avec deux `$lookup` (vers `balances` et `transactions`).

---

### 4.5 — Détail par modèle ce mois (optimisation choix modèles)

**Cas d'usage** : « Combien on dépense sur Claude Opus vs Sonnet vs GPT-5.2 ce mois ? » → pilotage du mix modèles pour optimiser le budget.

**Variante A — tous modèles confondus** (visibilité globale, inclut Featherless) :

```javascript
db.transactions.aggregate([
  {
    $match: {
      createdAt: {
        $gte: ISODate('2026-05-01T00:00:00Z'),
        $lt:  ISODate('2026-06-01T00:00:00Z')
      },
      tokenType: { $in: ['prompt', 'completion'] }
    }
  },
  {
    $group: {
      _id: '$model',
      promptCost: {
        $sum: {
          $cond: [{ $eq: ['$tokenType', 'prompt'] }, { $abs: '$tokenValue' }, 0]
        }
      },
      completionCost: {
        $sum: {
          $cond: [{ $eq: ['$tokenType', 'completion'] }, { $abs: '$tokenValue' }, 0]
        }
      },
      totalTokens: { $sum: { $abs: '$rawAmount' } },
      txCount: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 0,
      model: '$_id',
      promptUSD: { $round: [{ $divide: ['$promptCost', 1000000] }, 4] },
      completionUSD: { $round: [{ $divide: ['$completionCost', 1000000] }, 4] },
      totalUSD: {
        $round: [
          { $divide: [{ $add: ['$promptCost', '$completionCost'] }, 1000000] },
          4
        ]
      },
      totalTokens: 1,
      txCount: 1
    }
  },
  { $sort: { totalUSD: -1 } }
])
```

**Variante B — Claude et GPT uniquement** (analyse budgétaire fiable, exclut Featherless / endpoints custom) :

Identique à la Variante A, **avec un `$match` enrichi d'un filtre regex sur le nom du modèle** :

```javascript
db.transactions.aggregate([
  {
    $match: {
      createdAt: {
        $gte: ISODate('2026-05-01T00:00:00Z'),
        $lt:  ISODate('2026-06-01T00:00:00Z')
      },
      tokenType: { $in: ['prompt', 'completion'] },
      model: { $regex: /^(claude-|gpt-)/i }
    }
  },
  // ... reste IDENTIQUE à la Variante A (copier les étapes $group, $project, $sort)
  {
    $group: {
      _id: '$model',
      promptCost: {
        $sum: {
          $cond: [{ $eq: ['$tokenType', 'prompt'] }, { $abs: '$tokenValue' }, 0]
        }
      },
      completionCost: {
        $sum: {
          $cond: [{ $eq: ['$tokenType', 'completion'] }, { $abs: '$tokenValue' }, 0]
        }
      },
      totalTokens: { $sum: { $abs: '$rawAmount' } },
      txCount: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 0,
      model: '$_id',
      promptUSD: { $round: [{ $divide: ['$promptCost', 1000000] }, 4] },
      completionUSD: { $round: [{ $divide: ['$completionCost', 1000000] }, 4] },
      totalUSD: {
        $round: [
          { $divide: [{ $add: ['$promptCost', '$completionCost'] }, 1000000] },
          4
        ]
      },
      totalTokens: 1,
      txCount: 1
    }
  },
  { $sort: { totalUSD: -1 } }
])
```

> **Pourquoi la Variante B ?** L'endpoint custom Featherless (modèle `jpacifico/French-Alpaca-Llama3-8B-Instruct-v1.0`) matche accidentellement la clé `llama3-8b` du tarif AWS Bedrock dans `tx.ts` (audit du 28 mai). Son coût USD reporté n'est donc pas représentatif du vrai tarif Featherless. La Variante B exclut ces modèles pour une analyse budgétaire fiable Claude/GPT. Tant que le quirk n'est pas corrigé (sujet config endpoint séparé), privilégier la Variante B pour les arbitrages budgétaires.

> **Web search native Anthropic** (~10 $ / 1 000 searches) : **non trackée** dans `transactions` — uniquement les tokens de prompt/completion sont comptabilisés. Le surcoût recherche est facturé directement côté API Anthropic et n'apparaît pas dans ces requêtes. Décision actée hors scope V1.

---

## 5. Maintenance et opérations

### 5.1 Commandes npm utiles

| Commande | Usage |
|---|---|
| `npm run list-balances` | Affiche les soldes de tous les users (table simple) |
| `npm run user-stats` | Stats agrégées users (date d'inscription, dernière connexion, etc.) |
| `npm run set-balance <email> <amount>` | Écrase le solde du user à `<amount>` (en mills). Ex. `set-balance sophie@betc.com 10000000` = solde fixé à 10 USD |
| `npm run add-balance <email> <amount>` | Incrémente le solde du user de `<amount>`. Ex. `add-balance sophie@betc.com 5000000` = +5 USD |
| `npm run create-user` | Création d'un user en CLI |
| `npm run invite-user` | Invitation par email |

### 5.2 Recharger manuellement un user (V1, autoRefill désactivé)

Cas typique : un user a épuisé son solde et appelle l'admin.

```bash
# Vérifier le solde courant
npm run list-balances | grep sophie.dupont@betc.com

# Ajouter 5 USD (5M mills)
npm run add-balance sophie.dupont@betc.com 5000000

# Vérifier
npm run list-balances | grep sophie.dupont@betc.com
```

### 5.3 Export CSV ad-hoc

Pour un export plus complet, depuis `mongosh` :
```javascript
// Sauvegarder le résultat d'une requête dans une variable, puis l'imprimer en JSON
var results = db.transactions.aggregate([ /* requête */ ]).toArray();
JSON.stringify(results, null, 2);
```
Copier la sortie, coller dans un éditeur ou parser via `jq` / Python pour CSV. Pour une exécution récurrente (rapport hebdo), envisager un petit script Node ad-hoc (sujet V1.1).

---

## 6. Évolutions V1.1+

### UI custom admin de consommation

**Décision actée V1** : pas d'UI custom — playbook MongoDB suffit. À réévaluer après quelques semaines d'usage réel :

- **Critère de bascule** : si Loïse ou Antoine utilisent le playbook **plus d'une fois par semaine** et que la mise en œuvre devient lourde (copier-coller, ajustement de dates, lecture JSON), alors l'UI custom devient prioritaire.
- **Si le playbook reste utilisé ponctuellement** (1-2 fois par mois), rester sur le playbook : pas d'investissement dette technique.
- **Effort estimé** si bascule : ~2-3 jours dev (route admin protégée par rôle ADMIN + endpoint d'agrégation Mongo + composant React tableau filtrable + sidebar admin).

### Admin Panel ClickHouse V2 (mi-juin)

L'Admin Panel ClickHouse, prévu en V2, **ne couvre PAS le reporting de consommation** d'après la doc upstream (sa cible : gouvernance users / rôles / grants / permissions / config overrides, pas analytics usage). Cf. note d'investigation du 27 mai.

Conséquence : le besoin « UI admin consommation » reste à traiter séparément (chantier UI custom V1.1+ ou intégration tierce — voir ci-dessous).

### Dashboard tiers communautaire

[innFactory/librechat-admin-dashboard](https://github.com/innFactory/librechat-admin-dashboard) propose des « Usage Metrics » externes. **PoC tiers**, non maintenu par l'équipe LibreChat. À vetter en V2+ avant intégration : licence, maintenance active, compatibilité v0.8.5, sécurité (accès base/réseau). Pas prioritaire tant que le playbook MongoDB répond au besoin.

---

## Annexe — Référence rapide

| Élément | Valeur |
|---|---|
| Collection consommation | `transactions` |
| Collection soldes | `balances` |
| Champ `tokenValue` (consommation) | **négatif**, à passer par `$abs` |
| Unité | 1 000 000 unités = 1 USD |
| `startBalance: 10000000` | 10 USD par user (V1) |
| `autoRefillEnabled: false` | Rechargement manuel V1 via `set-balance` |
| Web search Anthropic | **non trackée** dans `transactions` (~10 $ / 1k searches, facturé côté API) |
| Featherless | tarification approximative (quirk match Bedrock llama3-8b) |
