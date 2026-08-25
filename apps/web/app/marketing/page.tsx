import type { Metadata } from 'next'

import styles from './marketing.module.css'

export const metadata: Metadata = {
  title: 'Claimfold — the record behind the post',
  description: 'A self-hosted studio for researched, cited Instagram carousels.',
}

const RECORD_CLAIMS = [
  {
    mark: '■',
    text: 'Napoleon’s height at death was recorded as 5 ft 2 in in French units.',
    source: '3 sources · Fondation Napoléon · BnF · Royal Society of Medicine',
    score: '0.91',
    verdict: 'holds',
    tone: 'holds',
  },
  {
    mark: '■',
    text: 'The French inch of the period was longer than the English inch.',
    source: '4 sources · BIPM · Cambridge University Press · 2 others',
    score: '0.88',
    verdict: 'holds',
    tone: 'holds',
  },
  {
    mark: '†',
    text: 'The average adult man in France around 1800 was 1.65 m tall.',
    source: '2 sources · the samples disagree',
    score: '0.55',
    verdict: 'disputed',
    tone: 'disputed',
  },
]

const RECORD_FIELDS = [
  ['Run', 'CF–000184'],
  ['Channel floor', '0.75'],
  ['Core claims', '3'],
  ['Opened pages', '9'],
]

export default function MarketingPage() {
  return (
    <main className={styles.site}>
      <a className={styles.skipLink} href="#record">
        Skip to the example record
      </a>

      <header className={styles.header}>
        <a className={styles.wordmark} href="#top" aria-label="Claimfold home">
          <span className={styles.mark} aria-hidden="true">
            <span />
          </span>
          <span>Claimfold</span>
        </a>
        <nav className={styles.nav} aria-label="Sections">
          <a href="#record">The record</a>
          <a href="#method">Method</a>
          <a href="#running">Running it</a>
        </nav>
        <a className={styles.headerAction} href="#running">
          Read the install notes <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className={styles.hero} id="top" aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span aria-hidden="true">§</span> Self-hosted editorial infrastructure
          </p>
          <h1 id="hero-title">
            Mostly right is
            <br />
            still <em>not enough.</em>
          </h1>
          <p className={styles.intro}>
            Claimfold researches the claims in an Instagram carousel against live web
            sources, keeps the record, and blocks publication when a core claim does
            not clear the floor your channel set.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#record">
              Inspect a blocked post <span aria-hidden="true">↓</span>
            </a>
            <p>
              Not a scheduler. Not a caption generator.
              <br />
              Static carousels only.
            </p>
          </div>
        </div>

        <aside className={styles.heroAside} aria-label="The principle">
          <span className={styles.asideRule} aria-hidden="true" />
          <p className={styles.asideNumber}>01</p>
          <p>
            The useful artifact is not only the post that went out. It is the complete
            record of the one that did not.
          </p>
          <span className={styles.obelus} aria-hidden="true">
            †
          </span>
        </aside>
      </section>

      <section className={styles.recordSection} id="record" aria-labelledby="record-title">
        <div className={styles.sectionLead}>
          <p className={styles.kicker}>An example record</p>
          <h2 id="record-title">This carousel does not publish.</h2>
          <p>
            A core claim is disputed and sits below the channel’s floor. The record
            remains available, with the sources and the reason visible.
          </p>
        </div>

        <article className={styles.caseFile} aria-label="Example of a blocked post record">
          <div className={styles.fileSpine} aria-hidden="true">
            <span>CLAIMFOLD</span>
            <span>RECORD / 000184</span>
          </div>
          <div className={styles.fileBody}>
            <div className={styles.fileHeader}>
              <div>
                <p className={styles.fileLabel}>Proposed carousel</p>
                <h3>War Napoleon wirklich klein?</h3>
                <p className={styles.fileMeta}>German · misconception · 6 slides proposed</p>
              </div>
              <div className={styles.blockStamp}>
                <span>Publication</span>
                <strong>Blocked</strong>
              </div>
            </div>

            <div className={styles.fileGrid}>
              <dl className={styles.recordFacts}>
                {RECORD_FIELDS.map(([term, definition]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{definition}</dd>
                  </div>
                ))}
              </dl>
              <div className={styles.marginNote}>
                <span className={styles.marginMark} aria-hidden="true">
                  †
                </span>
                <p>
                  The obelus is the correction mark used for a passage an editor
                  doubts. Here, it means the sources do not hold the claim firmly
                  enough to publish it.
                </p>
              </div>
            </div>

            <ol className={styles.claims}>
              {RECORD_CLAIMS.map((claim, index) => (
                <li className={styles.claim} key={claim.text}>
                  <span className={`${styles.claimMark} ${styles[claim.tone]}`} aria-hidden="true">
                    {claim.mark}
                  </span>
                  <div className={styles.claimCopy}>
                    <p>
                      <span className={styles.claimIndex}>{String(index + 1).padStart(2, '0')}</span>
                      {claim.text}
                    </p>
                    <span>{claim.source}</span>
                  </div>
                  <div className={`${styles.verdict} ${styles[claim.tone]}`}>
                    <strong>{claim.score}</strong>
                    <span>{claim.verdict}</span>
                  </div>
                </li>
              ))}
            </ol>

            <div className={styles.fileFooter}>
              <div className={styles.reason}>
                <p className={styles.fileLabel}>Reason for refusal</p>
                <p>
                  Claim 03 is core, disputed and <strong>0.20 below the confidence floor.</strong>
                </p>
              </div>
              <div className={styles.signature}>
                <span className={styles.signatureLine} />
                <p>No override filed</p>
              </div>
            </div>
          </div>
        </article>

        <div className={styles.recordLegend}>
          <p>
            <span className={styles.legendMark}>■</span> holds
          </p>
          <p>
            <span className={styles.legendMark}>†</span> disputed
          </p>
          <p>
            <span className={styles.legendMark}>□</span> unverifiable
          </p>
          <p>Colour never carries a verdict on its own.</p>
        </div>
      </section>

      <section className={styles.methodSection} id="method" aria-labelledby="method-title">
        <div className={styles.methodIntro}>
          <p className={styles.kicker}>Order matters</p>
          <h2 id="method-title">The gate runs before the writing.</h2>
          <p>
            A polished draft can make a weak claim feel easier to wave through. Claimfold
            puts the expensive, persuasive part after the claims have been researched and
            the gate has made its decision.
          </p>
          <aside className={styles.legalNote}>
            <span aria-hidden="true">§</span>
            <p>
              The language stops at researched, cited, and blocked until a person signs
              off. That is the claim the record can support.
            </p>
          </aside>
        </div>

        <ol className={styles.sequence}>
          <li>
            <span>01</span>
            <div>
              <h3>Four candidate angles</h3>
              <p>Disposable ideas, before there is a slide to become attached to.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Research the claims</h3>
              <p>Every page opened is retained, including pages that did not help.</p>
            </div>
          </li>
          <li className={styles.gateStep}>
            <span>03</span>
            <div>
              <h3>The gate</h3>
              <p>Core claims below the channel floor stop the run before writing begins.</p>
            </div>
            <strong>STOP</strong>
          </li>
          <li>
            <span>04</span>
            <div>
              <h3>Write, review, then sign</h3>
              <p>Two to ten static slides. A change to the words raises the review again.</p>
            </div>
          </li>
        </ol>

        <div className={styles.artifacts}>
          <p className={styles.kicker}>The record travels with the decision</p>
          <div>
            <span>Verdicts and confidence</span>
            <span>Sources and opened pages</span>
            <span>Named overrides</span>
            <span>Browser, PDF, JSON, CSV</span>
          </div>
        </div>
      </section>

      <section className={styles.runningSection} id="running" aria-labelledby="running-title">
        <div className={styles.runningHeading}>
          <p className={styles.kicker}>Running Claimfold</p>
          <h2 id="running-title">Yours, on your own box.</h2>
          <p>
            Built for operators who prefer to keep their work, their model key and their
            account connection in an installation they control.
          </p>
          <a className={styles.textLink} href="#top">
            Back to the beginning <span aria-hidden="true">↑</span>
          </a>
        </div>
        <dl className={styles.requirements}>
          <div>
            <dt>Runtime</dt>
            <dd>Node 22+ · Docker for production</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>One provider key · recorded model cost per run</dd>
          </div>
          <div>
            <dt>Carousel</dt>
            <dd>2–10 static JPEG slides · 1080 × 1350</dd>
          </div>
          <div>
            <dt>Licence</dt>
            <dd>BUSL 1.1 · the gate remains free permanently</dd>
          </div>
        </dl>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span className={styles.mark} aria-hidden="true">
            <span />
          </span>
          <span>Claimfold</span>
        </div>
        <p>
          In development. The pipeline runs end to end; publishing has not yet been
          exercised against a live Instagram account.
        </p>
        <p>© Claimfold · BUSL 1.1</p>
      </footer>
    </main>
  )
}
