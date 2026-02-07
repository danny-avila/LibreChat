import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div style={{ maxWidth: '800px', margin: '0 auto 2rem auto', textAlign: 'center' }}>
          <p>
            AccèsLLM, propulsée par l’application LibreChat, vous offre un accès sécurisé aux modèles d'intelligence artificielle les plus performants du marché. Cette solution vous permet d'explorer et de comparer diverses technologies afin d'identifier celle qui répond le mieux à vos objectifs.
          </p>
          <p>
            Ce service est actuellement déployé à titre de projet pilote. Les commentaires et suggestions de la communauté sont essentiels à son développement. Vous pouvez nous joindre à <a href="mailto:accesllm@etsmtl.ca" style={{ color: 'red', textDecoration: 'underline' }}>accesllm@etsmtl.ca</a>.
          </p>
        </div>
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="pathname:///chat">
            Essayer la plateforme
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`Hello from ${siteConfig.title}`}
      description="Description will go into a meta tag in <head />">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
