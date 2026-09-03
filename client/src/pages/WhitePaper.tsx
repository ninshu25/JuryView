import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';

const SECTIONS = [
  ['what', '1 · What this is'],
  ['agents', '2 · The twelve agents'],
  ['round', '3 · Anatomy of a round'],
  ['traits', '4 · The trait maths'],
  ['attribution', '5 · Attributing the change'],
  ['transcripts', '6 · Transcripts as input'],
  ['stack', '7 · Architecture'],
  ['limits', '8 · Limitations'],
] as const;

export function WhitePaper() {
  return (
    <div className="paper">
      <header className="landing-nav">
        <Link to="/" className="wordmark">
          <Icon name="scales" size={19} className="scales" />
          <span className="mark">NOTaJury</span>
        </Link>
        <nav>
          <Link to="/app" className="btn primary small">
            Open the simulator
          </Link>
        </nav>
      </header>

      <div className="paper-shell">
        <aside className="paper-toc">
          <span className="toc-label">Contents</span>
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </aside>

        <article className="paper-body">
          <p className="eyebrow">Technical white paper</p>
          <h1>How NOTaJury works</h1>
          <p className="lede">
            A jury is not one mind. NOTaJury models it as twelve, each reasoning
            independently and then arguing — so the aggregate is something the system
            arrives at rather than something a single model asserts.
          </p>

          <div className="callout severe">
            <strong>This is a simulation.</strong> Nothing NOTaJury produces is a
            determination of guilt or innocence, a prediction of a real jury, or evidence
            of anything. It models deliberation dynamics and nothing else. Where the input
            comes from a real proceeding, the output is simulated opinion about real
            people and must never be presented as a finding about them.
          </div>

          <section id="what">
            <h2>1 · What this is</h2>
            <p>
              The usual way to ask a model about a case is to ask it once and read the
              answer. That collapses the thing that actually makes juries interesting —
              disagreement, and what resolves it — into a single confident paragraph.
            </p>
            <p>
              NOTaJury keeps twelve positions alive at once. Each juror holds a{' '}
              <em>lean</em> from −1 (not guilty) through 0 (undecided) to +1 (guilty), a
              confidence, and its own written reasoning. The headline gauge is the mean of
              those twelve leans; the Guilty / Not guilty / Uncertain blocs are the ±0.2
              bands. Nothing is stored as a verdict, because the system never reaches one.
            </p>
          </section>

          <section id="agents">
            <h2>2 · The twelve agents</h2>
            <p>
              Each juror is an archetype — The Engineer, The Empath, The Contrarian, The
              Follower — with seven traits scored 0 to 1:
            </p>
            <table className="paper-table">
              <thead>
                <tr>
                  <th>Trait</th>
                  <th>What it governs</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['skepticism', 'How much corroboration is demanded before believing anything'],
                  ['empathy', 'How heavily the human situation of the parties weighs'],
                  ['analytical', 'Reasoning from structure, chronology, consistency'],
                  ['emotionality', 'Susceptibility to emotionally charged material'],
                  ['authorityTrust', 'Weight given to experts, police and officials'],
                  ['independence', 'Willingness to hold a minority position'],
                  ['suggestibility', 'How readily a confident peer shifts the view'],
                ].map(([t, d]) => (
                  <tr key={t}>
                    <td>
                      <code>{t}</code>
                    </td>
                    <td>{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Traits do two jobs. They are written into each agent's system prompt in plain
              language, so the model reasons in character. And they parameterise the
              arithmetic that decides how far a juror actually moves — so a stated
              personality cannot drift away from behaviour.
            </p>
          </section>

          <section id="round">
            <h2>3 · Anatomy of a round</h2>
            <p>One trial event is one round, processed in three phases.</p>

            <h3>Phase 1 — independent evaluation</h3>
            <p>
              Every juror gets its own model call, carrying the case summary, everything
              heard so far, its own previous position and reasoning, and the new item. The
              twelve calls run concurrently. A juror's sampling temperature is derived from
              its traits — analytical jurors reason more deterministically, emotional ones
              more variably. If a call fails, that juror alone falls back to a built-in
              heuristic agent; one bad response never takes down a deliberation.
            </p>

            <h3>Phase 2 — evidence intake</h3>
            <p>
              The agent's conclusion is not adopted wholesale. It is blended into the
              juror's existing position at a rate <code>openness</code>, built from traits
              and from the character of the evidence — its probative strength, how
              emotionally charged it is, and how much it rests on an authority.
            </p>
            <pre className="paper-code">{`openness  = 0.35 + 0.4·analytical − 0.28·skepticism
          + emotional·(0.30·empathy + 0.22·emotionality)
          − emotional·(0.20·analytical)
          + authority·(0.28·authorityTrust)
          − authority·(0.18·(1 − authorityTrust))
openness *= 0.4 + 0.6·strength

lean ← lean + openness · (target − lean)`}</pre>

            <h3>Phase 3 — deliberation</h3>
            <p>
              Jurors then pull on each other for a configurable number of passes. For each
              juror, every peer is weighted by its persuasiveness and confidence, then
              discounted by how far apart the two already are — sceptical and independent
              jurors dismiss voices they disagree with rather than averaging with them.
            </p>
            <pre className="paper-code">{`weight_ij      = persuasiveness(j) · max(0.05, affinity_ij)
affinity_ij    = 1 − disagreement·(0.5·skepticism_i + 0.3·independence_i)
groupLean_i    = Σ weight_ij · lean_j  /  Σ weight_ij
susceptibility = 0.08 + 0.5·suggestibility − 0.42·independence − 0.18·confidence

lean_i ← lean_i + susceptibility · (groupLean_i − lean_i) · 0.45`}</pre>
          </section>

          <section id="traits">
            <h2>4 · The trait maths, and two things it got wrong</h2>
            <p>
              Two failures in the first working version are worth recording, because both
              produced output that looked plausible while being structurally wrong.
            </p>

            <h3>Convergence collapse</h3>
            <p>
              Originally, traits only set <em>how fast</em> a juror moved toward the model's
              conclusion — never <em>where</em> it ended up. Since all twelve read the same
              evidence and received similar conclusions, all twelve converged on the same
              number. Deliberation then had nothing to resolve: a full round of argument
              produced <strong>zero</strong> influence between jurors.
            </p>
            <p>
              The fix is a persistent <code>dispositionBias</code>, a standing personal tilt
              of roughly ±0.25 applied to whatever the agent concludes:
            </p>
            <pre className="paper-code">{`bias = −0.25·(skepticism − 0.5)      // demanding proof favours acquittal
     + 0.22·(authorityTrust − 0.5)  // crediting officials favours the state
     − 0.12·(empathy − 0.5)         // sympathy leans to the defendant
     + 0.10·(emotionality − 0.5)`}</pre>
            <p>
              Same evidence, different landing place. That is what makes the room disagree,
              and therefore what gives deliberation something to do.
            </p>

            <h3>Confidence ratchet</h3>
            <p>
              Agreement in the room raised each juror's confidence a little every pass. With
              nothing anchoring it, confidence climbed monotonically across rounds and
              pinned at the ceiling by round five — every juror maximally certain forever,
              which made the confidence ring meaningless.
            </p>
            <p>
              Confidence is now re-anchored each round to the juror's own reading of the
              evidence, then adjusted by a bounded ±0.15 for how the room received it. It
              can fall again.
            </p>
          </section>

          <section id="attribution">
            <h2>5 · Attributing the change</h2>
            <p>
              Every juror's movement in a round is split into the part that came from the
              evidence (phase 2) and the part that came from peers (phase 3). Within phase
              3, each shift is divided among the peers who pulled in that direction,
              proportional to their weighted contribution.
            </p>
            <p>
              That is what the "Why did the jury change?" panel reads from — it is recorded
              attribution, not a model asked after the fact to explain itself. The influence
              arcs drawn between seats are the same edges.
            </p>
          </section>

          <section id="transcripts">
            <h2>6 · Transcripts as input</h2>
            <p>
              Court reporting arrives as dialogue, so NOTaJury takes it that way. Paste a
              block and the server parses lines shaped <code>Speaker: words</code> into
              structured turns; anything else is preserved as the reporter's aside.
            </p>
            <pre className="paper-code">{`Cini returns to a chat involving Fenech and Schembri.

Fenech: Lost my phone, my friend.
Schembri: Delete WhatsApp.
Cini: Had you deleted WhatsApp?
Fenech: I do not remember.`}</pre>
            <p>
              The exchange is passed verbatim to every agent, which is asked to weigh not
              just the content but the manner — hesitation, evasion, a concession under
              pressure, a straight answer.
            </p>
            <p>
              The parser deliberately does <strong>not</strong> infer a speaker's role from
              their name. Labelling a named individual "the prosecution" is a factual claim
              the software has no basis for, so roles stay neutral unless the label itself
              says otherwise, and speakers are coloured by order of appearance.
            </p>
          </section>

          <section id="stack">
            <h2>7 · Architecture</h2>
            <p>
              React and TypeScript on the front, Node and Express on the back, Postgres for
              state. The entire AI surface is one interface:
            </p>
            <pre className="paper-code">{`interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  evaluate(input: JurorEvaluationInput): Promise<JurorEvaluationOutput>;
}`}</pre>
            <p>
              Groq ships as the default adapter. To swap it, implement that interface,
              register it, and set <code>AI_PROVIDER</code> — the simulation engine is
              untouched. Because Groq's endpoint is OpenAI-compatible, any OpenAI-shaped API
              already works by overriding <code>AI_BASE_URL</code>. With no key configured,
              a deterministic heuristic agent stands in so the system still runs.
            </p>
            <p>
              Trial events arrive at <code>POST /api/cases/:id/events</code>, which appends
              the event and runs a full round. Positions, snapshots and influence edges are
              persisted per round, so history and attribution survive a reload.
            </p>
          </section>

          <section id="limits">
            <h2>8 · Limitations</h2>
            <ul className="paper-list">
              <li>
                <strong>The agents are not people.</strong> They cannot watch a witness,
                weigh demeanour, or notice what a room notices. Personality is a prompt and
                seven numbers.
              </li>
              <li>
                <strong>The trait constants are chosen, not fitted.</strong> They were tuned
                until behaviour looked reasonable. They are not derived from jury research
                and carry no empirical claim.
              </li>
              <li>
                <strong>The model is the confound.</strong> Twelve agents built on one model
                share its priors. Genuine independence would need genuinely different
                models.
              </li>
              <li>
                <strong>Output depends on framing.</strong> Which items you feed, in what
                order, with what strength, changes the result — often more than the content
                does.
              </li>
              <li>
                <strong>It has no notion of law.</strong> No burden of proof it can actually
                apply, no rules of evidence, no jurisdiction.
              </li>
            </ul>
            <p>
              Useful for exploring how a group's position might move under pressure, and for
              seeing which material does the work. Not useful for deciding whether anybody
              did anything.
            </p>
          </section>

          <div className="paper-end">
            <Link to="/app" className="btn primary">
              Open the simulator
            </Link>
            <Link to="/" className="btn">
              Back to start
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
