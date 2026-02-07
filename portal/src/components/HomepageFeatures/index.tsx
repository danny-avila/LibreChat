import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Accès gratuit',
    Svg: require('@site/static/img/free.svg').default,
    description: (
      <>
        Accédez aux modèles les plus performants sans aucun abonnement requis. Le service est entièrement gratuit.
      </>
    ),
  },
  {
    title: 'Multi-modèles à la carte',
    Svg: require('@site/static/img/models.svg').default,
    description: (
      <>
        Alternez instantanément entre de nombreux fournisseurs tels qu'Anthropic et OpenAI (d'autres seront ajoutés prochainement).
      </>
    ),
  },
  {
    title: 'Intelligence connectée',
    Svg: require('@site/static/img/connect.svg').default,
    description: (
      <>
        Connectez l'IA à vos propres outils et documents via <strong>MCP (Model Context Protocol)</strong> et <strong>RAG (Retrieval-Augmented Generation)</strong>.
      </>
    ),
  },
];

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
