import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LEANING_COLORS } from '../theme';

/** Decorative jury row — mirrors the seat colours used in the simulator. */
const DEMO_SEATS = [
  'guilty', 'uncertain', 'not_guilty', 'not_guilty', 'uncertain', 'guilty',
  'not_guilty', 'uncertain', 'not_guilty', 'guilty', 'uncertain', 'not_guilty',
] as const;

const STEPS = [
  {
    n: '01',
    title: 'Feed it what was said',
    body: 'Paste a court transcript, describe a piece of evidence, or POST it to the API. Each item becomes one round of the trial.',
  },
  {
    n: '02',
    title: 'Twelve agents read it alone',
    body: 'Every juror is its own model call, with its own personality written into the prompt. Nobody sees anybody else\'s answer yet.',
  },
  {
    n: '03',
    title: 'Then they argue',
    body: 'Jurors pull on each other, weighted by confidence and persuasiveness and resisted by independence. Every shift is attributed to who caused it.',
  },
];

const TRAITS = [
  'skepticism', 'empathy', 'analytical', 'emotionality',
  'authority trust', 'independence', 'suggestibility',
];

export function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="wordmark">
          <Icon name="scales" size={19} className="scales" />
          <span className="mark">NOTaJury</span>
        </span>
        <nav>
          <Link to="/paper">White paper</Link>
          <Link to="/app" className="btn primary small">
            Open the simulator
          </Link>
        </nav>
      </header>

      <section className="hero">
        <span className="eyebrow">AI simulation · not a determination of guilt</span>
        <h1>
          Twelve minds,
          <br />
          <em>one verdict gauge.</em>
        </h1>
        <p className="lede">
          NOTaJury runs a jury as twelve independent AI agents — each with its own
          scepticism, empathy and stubbornness — and shows you how a room full of
          people <em>might</em> move as evidence lands. Not one model's answer.
          Twelve, arguing.
        </p>

        <div className="hero-cta">
          <Link to="/app" className="btn primary">
            Open the simulator
          </Link>
          <Link to="/paper" className="btn">
            Read how it works
          </Link>
        </div>

        <div className="hero-jury" aria-hidden="true">
          {DEMO_SEATS.map((leaning, i) => (
            <motion.span
              key={i}
              className="hero-seat"
              style={{
                borderColor: LEANING_COLORS[leaning],
                background: `${LEANING_COLORS[leaning]}22`,
              }}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 + i * 0.045, duration: 0.45 }}
            >
              {i + 1}
            </motion.span>
          ))}
        </div>
        <p className="hero-jury-caption">
          <span style={{ color: LEANING_COLORS.guilty }}>● guilty</span>
          <span style={{ color: LEANING_COLORS.not_guilty }}>● not guilty</span>
          <span style={{ color: LEANING_COLORS.uncertain }}>● uncertain</span>
          — each seat is a separate agent holding its own position
        </p>
      </section>

      <section className="landing-section">
        <h2 className="section-heading">How a round works</h2>
        <div className="step-grid">
          {STEPS.map((s) => (
            <article key={s.n} className="step">
              <span className="step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <h2 className="section-heading">What makes each juror different</h2>
        <p className="section-lede">
          Seven traits, scored 0–1, written into every agent's prompt and into the maths
          that decides how far it moves. A juror high in independence and low in
          suggestibility will sit in a minority of one for the whole trial.
        </p>
        <div className="trait-chips">
          {TRAITS.map((t) => (
            <span key={t} className="trait-chip">
              {t}
            </span>
          ))}
        </div>
      </section>

      <section className="landing-section disclaimer-block">
        <h2 className="section-heading">Read this part</h2>
        <p>
          <strong>
            NOTaJury does not determine guilt or innocence, and its output is not evidence
            of anything.
          </strong>{' '}
          It is a visualisation of a model. The agents are fictional, they cannot see a
          witness, they have no access to a full record, and they answer to nobody. A
          reading of "67% guilty" describes this software — never a person.
        </p>
        <p>
          If you feed it transcripts from a real proceeding, you are producing simulated
          opinions about real, identifiable people. That output can do real harm if it is
          shown without this context. Keep the labelling attached to anything you export,
          and don't present it as commentary on anyone's actual culpability.
        </p>
      </section>

      <footer className="landing-foot">
        <span>NOTaJury — an AI jury simulation</span>
        <span>
          <Link to="/paper">White paper</Link> · <Link to="/app">Simulator</Link>
        </span>
      </footer>
    </div>
  );
}
