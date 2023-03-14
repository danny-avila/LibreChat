# ChatGPT Lab FR
https://user-images.githubusercontent.com/110412045/223754183-8b7f45ce-6517-4bd5-9b39-c624745bf399.mp4

## Toutes les conversations sur l'IA sous un même toit. ##
  Les assistants IA sont l'avenir et OpenAI a révolutionné ce mouvement avec ChatGPT. Bien qu'il existe de nombreuses méthodes pour les intégrer, cette application commémore le style original de ChatGPT, avec la possibilité d'intégrer n'importe quel modèle d'IA actuel ou futur, tout en améliorant les fonctionnalités originales du client, telles que la recherche de conversation et les modèles d'invite (actuellement WIP).

  Ce projet a été lancé au début du mois de février 23, anticipant la sortie de l'API officielle de ChatGPT d'OpenAI, et l'utilise désormais. Grâce à ce clone, vous pouvez éviter ChatGPT Plus en faveur d'API gratuites ou payantes. Je déploierai bientôt une démo de cette application. N'hésitez pas à contribuer, cloner ou forker. Actuellement dockerisé.

## Mises à jour
<details open>
<summary><strong>2023-03-12</strong></summary>




Vraiment reconnaissant pour tous les problèmes signalés et les contributions apportées, les fonctionnalités et les améliorations du projet se sont accélérées en conséquence. Mention honorable à [wtlyu](https://github.com/wtlyu) pour avoir contribué à une grande partie du code, à savoir la configuration du nom d'hôte et le style mobile. Je vais télécharger des images sur la prochaine version pour une installation plus rapide de docker, et commencer à les mettre à jour en même temps que ce repo.



Beaucoup d'améliorations dans tous les domaines, la plus importante étant la possibilité de démarrer des conversations simultanément (encore merci à [wtlyu](https://github.com/wtlyu) de me l'avoir signalé), car vous pouvez changer de conversation ou démarrer un nouveau chat sans qu'aucune réponse ne soit transmise par un chat précédent, car le backend continuera à traiter/sauvegarder les réponses des clients. Il faut juste se méfier des limitations de débit d'OpenAI/Microsoft si cela est fait de manière excessive.


L'ajout de la prise en charge de la recherche de conversation est la prochaine étape ! Merci à [mysticaltech](https://github.com/mysticaltech) d'avoir proposé une méthode que je peux utiliser pour cela.
</details>

<details>
<details>
<summary><strong>2023-03-09</strong></summary>
Version francophone de **chatgpt-clone**.

Sortie de la version 0.0.2

Ajoute Sydney (Bing AI jailbreaké) au menu modèle. Merci à [DavesDevFails](https://github.com/DavesDevFails) d'avoir attiré mon attention sur ce [problème](https://github.com/danny-avila/chatgpt-clone/issues/13). Bing/Sydney cite maintenant correctement les liens, plus de style à venir. Correction de quelques bugs négligés, et le menu du modèle ne se ferme pas lors de la suppression d'un customGpt.


J'ai réactivé le client de navigation ChatGPT (version gratuite) car il pourrait fonctionner pour la plupart des gens, mais il ne fonctionne plus pour moi. Sydney est de toute façon la meilleure solution gratuite.
</details>
<details>
<summary><strong>2023-03-07</strong></summary>
En raison de l'intérêt croissant pour le repo, j'ai dockerisé l'application à partir de cette mise à jour pour une installation rapide ! Voir les instructions d'installation ci-dessous. Je réalise que cela prend encore un peu de temps avec l'installation des dépendances de docker, donc c'est sur la feuille de route d'avoir une démo déployée. Par ailleurs, j'ai apporté des améliorations majeures à de nombreuses fonctionnalités existantes, principalement l'interface utilisateur et l'interface graphique.


A noter également que la méthode d'accès à la version gratuite ne fonctionne plus, je l'ai donc retirée de la sélection des modèles jusqu'à nouvel ordre.
</details>
<summary><strong>Mises à jour précédentes</strong></summary>

<details>
<summary><strong>2023-03-04</strong></summary>
Le préfixage et l'étiquetage personnalisés des invites sont désormais pris en charge par l'API officielle. Cela permet d'obtenir des résultats intéressants lorsque vous avez besoin de ChatGPT pour des utilisations spécifiques ou des divertissements. Sélectionnez 'CustomGPT' dans le menu du modèle pour configurer ceci, et vous pouvez choisir de sauvegarder la configuration ou de la référencer par conversation. La sélection du modèle changera en fonction de la conversation.
</details>
<details>
<summary><strong>2023-03-01</strong></summary>
L'API officielle de ChatGPT est disponible ! Suppression de davinci car l'API officielle est extrêmement rapide et 10x moins chère. Puisque l'étiquetage utilisateur et la préfixation des invites sont officiellement supportés, je vais ajouter une fonctionnalité View pour que vous puissiez les définir dans le chat, ce qui donne à l'interface utilisateur un cas d'utilisation supplémentaire. J'ai conservé le BrowserClient, puisqu'il est libre d'utilisation comme le site officiel.

L'interface Messages reflète correctement la coloration syntaxique du code. La réplication exacte du curseur n'est pas encore 1 pour 1, mais elle est assez proche. Plus tard dans le projet, j'implémenterai des tests pour les cas limites du code et j'explorerai la possibilité d'exécuter le code dans le navigateur. Pour l'instant, le code inconnu est par défaut du javascript, mais il détectera le langage le plus proche possible.
</details>
<details>
<summary><strong>2023-02-21</strong></summary>
BingAI est intégré (bien que malheureusement limité par Microsoft avec la limite de 5 msg/convo, 50 msgs/jour). Je vais devoir gérer le cas où Bing refuse de donner plus de réponses en plus des autres fonctionnalités de style que j'ai en tête. L'utilisation officielle de ChatGPT est de retour avec le nouveau BrowserClient. Je réfléchis à la manière de gérer l'interface utilisateur lorsque le modèle Ai change, puisque les conversations ne peuvent pas être persistées entre elles (ou peut-être construire un moyen d'y parvenir à un certain niveau).
</details>
<details>
<summary><strong>2023-02-15</strong></summary>
Je viens d'avoir accès à Bing AI, je vais donc me concentrer sur l'intégration de cette technologie à travers le BingAIClient 'expérimental' de waylaidwanderer.
</details>
<details>
<summary><strong>2023-02-14</strong></summary>

L'utilisation officielle de ChatGPT n'est plus possible bien que je l'ai récemment utilisé avec la [méthode de proxy inverse] de waylaidwanderer (https://github.com/waylaidwanderer/node-chatgpt-api/blob/main/README.md#using-a-reverse-proxy), et avant cela, à travers des modèles divulgués qu'il a également découverts.

Actuellement, ce projet ne fonctionne qu'avec le modèle `text-davinci-003`.
</details>
</details>

# Table des matières
- [ChatGPT Maison](#chatgpt-clone)
  - [Toutes les conversations IA sous un même toit](#toutes-les-conversations-ai-sous-un-seul-toit)
  - [Mises à jour](#misesàjour)
- [Table des matières](#table-of-contents)
  - [Feuille de route](#Feuille de route)
    - [Caractéristiques](#caractéristiques)
    - [Pile technologique](#piletechnique)
  - [Démarrage](#démarrage)
    - [Prérequis](#prerequisites)
  - [Usage](#usage)
    - [Local](#local)
    - [Docker](#docker)
    - [Tokens d'accès](#access-tokens)
    - [Proxy](#proxy)
    - [Mise à jour](#updating)
  - [Cas d'utilisation](#casd'utilisation)
  - [Origine](#origine)
  - [Caveats](#caveats)
    - [Concernant l'utilisation de l'API officielle de ChatGPT](#regarding-use-of-official-chatgpt-api)
  - [Contribuer](#contribuer)
  - [Licence](#license)

## Feuille de route

> **Avertissement**

> Ceci est un travail en cours. Je le construis en public. Pour information, il y a encore beaucoup de dette technologique à nettoyer. Vous pouvez suivre les progrès ici ou sur mon [Linkedin] (https://www.linkedin.com/in/danny-avila).

Voici les fonctionnalités que j'ai récemment terminées et celles que je prévois :

- [x] Conversation persistante
- [x] Renommer, supprimer des conversations
- [x] Gestion des erreurs dans l'interface utilisateur
- [x] Intégration de Bing AI
- [x] Gestion des changements de modèle d'IA (démarrer de nouvelles conversations dans les conversations existantes, se souvenir de la dernière sélectionnée)
- [x] Gestion des blocs de code (surlignage, markdown, presse-papiers, détection de la langue)
- [x] Gestion du Markdown
- [x] Personnalisation du préfixe/label de l'invite (ChatGPT personnalisé utilisant l'API officielle)
- [x] Pagination des conversations sur le serveur (limiter la recherche et charger plus avec le bouton 'show more')
- [x] Fichier de configuration pour un démarrage facile (docker compose)
- [x] Style mobile (merci à [wtlyu](https://github.com/wtlyu))
- [ ] Style de l'IA de Bing (pour les réponses suggérées, la fin de la conversation, etc.) - **En cours**
- [ ] Ajout d'un avertissement avant d'effacer les conversations
- [ ] Construire une suite de tests pour CI/CD
- [ ] Recherche de conversation (par titre)
- [ ] Resoumettre/éditer les messages envoyés
- [ ] Option de recherche sémantique (nécessite plus de jetons)
- [ ] Modèles d'invite/recherche
- [ ] Refonte/nettoyage du code (dette technologique)
- Utilisation optionnelle d'un stockage local pour les informations d'identification
- Déployer la démo

### Caractéristiques

- Réponse en continu identique à ChatGPT par le biais d'événements envoyés par le serveur
- Interface utilisateur du ChatGPT original, y compris le mode sombre
- Sélection du modèle d'IA (ChatGPT API officiel, BingAI, ChatGPT Free)
- Créer et sauvegarder des ChatGPTs personnalisés*

Le ChatGPT peut être "personnalisé" en définissant un message système ou un préfixe d'invite et un "rôle" alternatif à la demande d'API.

[Plus d'informations ici] (https://platform.openai.com/docs/guides/chat/instructing-chat-models). Voici un [exemple de cette application]()

### Pile technique

- Utilise [node-chatgpt-api](https://github.com/waylaidwanderer/node-chatgpt-api)
- Pas de tutoriels React boilerplate/toolchain/clone, créé à partir de zéro avec react@latest
- Utilisation des composants Tailwind CSS et [shadcn/ui](https://github.com/shadcn/ui)
- Docker, useSWR, Redux, Express, MongoDB, [Keyv](https://www.npmjs.com/package/keyv)

## Démarrage

### Prérequis
- npm
- Node.js >= 19.0.0
- MongoDB installé ou [MongoDB Atlas](https://account.mongodb.com/account/login) (requis si vous n'utilisez pas Docker)
- Docker (optionnel)](https://www.docker.com/get-started/)
- Clé API OpenAI](https://platform.openai.com/account/api-keys)
- Jetons d'accès BingAI, ChatGPT (facultatifs, IA gratuites)

## Utilisation

- **Clonez/téléchargez** le repo à l'endroit désiré
```bash
  git clone https://github.com/danny-avila/chatgpt-clone.git
```
- Si vous utilisez MongoDB Atlas, supprimez `&w=majority` de la chaîne de connexion par défaut.

### Local
- Exécutez npm** install dans les répertoires api et client.
- Fournissez toutes les informations d'identification (clés API, jetons d'accès et chaîne de connexion Mongo) dans api/.env [(voir l'exemple .env)](api/.env.example)
- **Run** `npm run build` dans le répertoire /client/, `npm start` dans le répertoire /api/.
- Visitez http://localhost:3080 (port par défaut) et appréciez.

Par défaut, seule la machine locale peut accéder à ce serveur. Pour le partager au sein du réseau ou servir de serveur public, mettez `HOST` à `0.0.0.0` dans le fichier `.env`.

### Docker

- Fournir** toutes les informations d'identification (clés API, jetons d'accès et chaîne de connexion Mongo) dans [docker-compose.yml](docker-compose.yml) sous le service api.
- Construire des images** dans les répertoires /api/ et /client/ (qui seront éventuellement partagées via docker hub)
    - `api/`
    ```bash
    docker build -t node-api .
    ```
    - `client/`
    ``bash
    docker build -t react-client .
    ```
- **Lancer** `docker-compose build` dans le répertoire racine du projet et ensuite `docker-compose up` pour démarrer l'application

### Jetons d'accès

<details>
<summary><strong>ChatGPT Free Instructions</strong></summary>

Pour obtenir votre jeton d'accès pour ChatGPT 'Free Version', connectez-vous à chat.openai.com, puis visitez https://chat.openai.com/api/auth/session.


**Avertissement:** Il y a de fortes chances que votre compte soit banni avec cette méthode. Continuez à le faire à vos risques et périls.

</details>

<details>
<summary><strong>Instructions BingAI</strong></summary>
Le jeton d'accès Bing est le cookie "_U" de bing.com. Utilisez les outils de développement ou une extension lorsque vous êtes connecté au site pour le voir.

**Note:** La gestion spécifique des erreurs et le style pour ce modèle sont encore en cours de développement.
</details>

### Proxy

Si votre serveur ne peut pas se connecter au serveur API de chatGPT pour une raison quelconque (par exemple en Chine). Vous pouvez définir une variable d'environnement `PROXY`. Celle-ci sera transmise à l'interface `node-chatgpt-api`.

**Warning:** `PROXY` n'est pas `reverseProxyUrl` dans `node-chatgpt-api`

<details>
<summary><strong>Mise en place d'un proxy dans l'environnement local</strong></summary>

Il y a deux façons de configurer un proxy.
- Option 1 : environnement au niveau du système
`export PROXY="http://127.0.0.1:7890"`
- Option 2 : dans le fichier .env
`PROXY="http://127.0.0.1:7890"`

**Changez `http://127.0.0.1:7890` pour votre serveur proxy**
</details>

<details>
<summary><strong>Mise en place du proxy dans l'environnement docker </strong></summary>

défini dans le fichier docker-compose.yml, sous services - api - environment

```
    api :
        ...
        environnement :
                ...
                - "PROXY=http://127.0.0.1:7890"
                # ajouter cette ligne ↑
```

**Changez `http://127.0.0.1:7890` pour votre serveur proxy**

</details>

### Mise à jour
- Comme le projet est toujours en cours, vous devriez prendre la dernière version et exécuter les étapes ci-dessus. Réinitialisez le cache de votre navigateur/effacez les données du site.

## Cas d'utilisation ##

  - Un guichet unique pour toutes les IA conversationnelles, avec en prime la possibilité d'effectuer des recherches dans les conversations passées.
  - En utilisant l'API officielle, vous devriez générer 7,5 millions de mots pour dépenser le même coût que ChatGPT Plus (20 $).
  - Les conversations ChatGPT/Google Bard/Bing AI sont perdues dans l'espace ou
  ne peuvent être recherchées au-delà d'un certain délai.
  - **Personnaliser ChatGPT**

    ![exemple de cas d'utilisation](./images/use_case3.png "Make a Custom GPT")

  - L'API n'est pas aussi limitée que ChatGPT Free (at [chat.openai.com](https://chat.openai.com/chat))**.

    ![exemple de cas d'utilisation](./images/use_case2.png "chat.openai.com devient plus limité de jour en jour !")

  - **ChatGPT Free est en panne.**

    ![use case example](./images/use_case.png "GPT is down ! Plus is too expensive !")


## Origine ##
  Ce projet a été créé à l'origine comme un produit minimum viable (ou MVP) pour le Bootcamp [@HackReactor](https://github.com/hackreactor/). Il a été construit avec OpenAI response streaming et la plupart de l'interface utilisateur a été réalisée en moins de 20 heures. À la fin de cette période, j'avais terminé la majeure partie de l'interface utilisateur et des fonctionnalités de base. Cette application a été créée sans utiliser de modèles ou de gabarits, y compris create-react-app et d'autres chaînes d'outils. Je n'ai pas suivi de tutoriels vidéo "non officiels de chatgpt", et j'ai simplement fait référence au site officiel pour l'interface utilisateur. Le but de l'exercice était d'apprendre à mettre en place un projet complet à partir de zéro. N'hésitez pas à nous faire part de vos commentaires, suggestions, ou à forker le projet pour votre propre usage.


## Caveats
### Concernant l'utilisation de l'API officielle de ChatGPT
De [@waylaidwanderer](https://github.com/waylaidwanderer/node-chatgpt-api/blob/main/README.md#caveats) :

Puisque `gpt-3.5-turbo` est le modèle sous-jacent de ChatGPT, j'ai dû faire de mon mieux pour reproduire la façon dont le site officiel de ChatGPT l'utilise.
Cela signifie que mon implémentation ou le modèle sous-jacent peut ne pas se comporter exactement de la même manière à certains égards :
- Les conversations ne sont pas liées à des identifiants d'utilisateur, donc si cela est important pour vous, vous devriez implémenter votre propre système d'identifiant d'utilisateur.
- Les paramètres du modèle de ChatGPT (température, pénalité de fréquence, etc.) sont inconnus, j'ai donc fixé des valeurs par défaut que j'ai jugées raisonnables.
- Les conversations sont limitées aux 3000 derniers tokens, de sorte que les messages antérieurs peuvent être oubliés au cours de conversations plus longues.
  - Le fonctionnement est similaire à celui de ChatGPT, sauf que je suis presque sûr qu'ils ont un moyen supplémentaire de récupérer le contexte des messages antérieurs en cas de besoin (ce qui peut probablement être réalisé avec des embeddings, mais je considère que c'est hors sujet pour l'instant).

## Contribuer
Si vous souhaitez contribuer, veuillez créer une demande de téléchargement avec une description détaillée de vos changements.

## Licence
Ce projet est sous licence MIT.
