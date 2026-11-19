/**
 * Tests for astro-better-mermaid.
 *
 * Invokes the remark transformer directly against synthetic AST nodes —
 * no remark pipeline or Astro integration needed.
 *
 * External link checking is not part of this plugin; those tests are intentionally absent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remarkMermaidSSR, mermaidTitleFix } from '../index.mjs';
import { readFileSync } from 'node:fs';
import { diagramType, htmlTagInLabel } from '../src/core.mjs';

// Run the mermaid transformer on a single code block and return the resulting node.
async function render(src, opts = {}) {
  const node = { type: 'code', lang: 'mermaid', meta: null, value: src };
  const tree = { type: 'root', children: [node] };
  await remarkMermaidSSR({ cache: false, ...opts })(tree);
  return tree.children[0];
}

// ── convenience assertions ────────────────────────────────────────────────────

function assertSVG(node, label) {
  assert.equal(node.type, 'html', `${label}: node should become html`);
  assert.ok(node.value.includes('<svg'), `${label}: output should contain <svg`);
  assert.ok(node.value.includes('data-mermaid-src'), `${label}: should have data-mermaid-src`);
}

// Each word must appear as SVG text, not only in the source attribute or the stylesheet.
function assertText(node, words) {
  const svg = node.value.slice(node.value.indexOf('<svg')).replace(/<style[\s\S]*?<\/style>/g, '');
  for (const word of words) {
    assert.ok(new RegExp(`>[^<]*${word}`).test(svg), `expected "${word}" in the SVG text`);
  }
}

// Run fn and collect what it passes to console.warn.
async function withWarnings(fn) {
  const warnings = [];
  const warn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    return { result: await fn(), warnings };
  } finally {
    console.warn = warn;
  }
}

// ── diagram fixtures ──────────────────────────────────────────────────────────

const DIAGRAMS = {
  flowchartBasic: `
flowchart LR
    A[Client] -->|1 redirect| B[Auth Server]
    B -->|2 login page| A
    A -->|3 credentials| B
    B -->|4 auth code| A
    A -->|5 exchange| B
    B -->|6 tokens| A
  `.trim(),

  // Subgraph with style directive — triggers the data-fill-color post-processing pass.
  flowchartClusters: `
flowchart TD
    subgraph ext["External IdP"]
        G[Google]
        GH[GitHub]
    end
    subgraph app["Your App"]
        Login[Login Page]
        CB[Callback]
    end
    Login -->|redirect| G
    Login -->|redirect| GH
    G -->|code| CB
    GH -->|code| CB
    style ext fill:#999
    style app fill:#944
  `.trim(),

  // Multi-word edge labels — triggers the tspan x-offset correction pass.
  flowchartEdgeLabels: `
flowchart LR
    Client -->|authorization code| Server
    Server -->|access token response| Resource
    Resource -->|protected resource data| Client
  `.trim(),

  sequenceOAuth: `
sequenceDiagram
    actor User
    participant App
    participant Auth as Auth Server
    participant RS as Resource Server
    User->>App: click login
    App->>Auth: GET /authorize?code_challenge=xyz
    Auth-->>User: show login form
    User->>Auth: submit credentials
    Auth-->>App: 302 ?code=abc123
    App->>Auth: POST /token code=abc123&verifier=xyz
    Auth-->>App: {access_token, id_token, refresh_token}
    App->>RS: GET /api/data Bearer token
    RS-->>App: 200 {data}
  `.trim(),

  stateDiagram: `
stateDiagram-v2
    [*] --> Anonymous
    Anonymous --> Authenticating : login()
    Authenticating --> Authenticated : success
    Authenticating --> Anonymous : failure
    Authenticated --> Refreshing : token expires
    Refreshing --> Authenticated : refresh ok
    Refreshing --> Anonymous : refresh fails
    Authenticated --> Anonymous : logout()
    Authenticated --> [*] : account deleted
  `.trim(),

  classDiagram: `
classDiagram
    class OAuthClient {
        +String clientId
        +String redirectUri
        +authorize(scope) URL
        +token(code) TokenSet
    }
    class AccessToken {
        +String value
        +String[] scopes
        +int expiresIn
        +isExpired() bool
    }
    class RefreshToken {
        +String value
        +Date rotatedAt
        +rotate() AccessToken
    }
    OAuthClient "1" --> "*" AccessToken : issues
    AccessToken "1" --> "0..1" RefreshToken : has
  `.trim(),

  erDiagram: `
erDiagram
    USER {
        uuid id PK
        string email
        timestamp created_at
    }
    APPLICATION {
        uuid client_id PK
        string name
    }
    ACCESS_TOKEN {
        uuid id PK
        string value
        timestamp expires_at
    }
    USER ||--o{ ACCESS_TOKEN : owns
    APPLICATION ||--o{ ACCESS_TOKEN : issues
  `.trim(),

  pieMfa: `
pie title MFA Method Adoption
    "TOTP Authenticator App" : 48
    "SMS One-Time Password" : 30
    "Hardware Security Key" : 12
    "Passkey / WebAuthn" : 10
  `.trim(),

  gantt: `
gantt
    title Auth Standards Timeline
    dateFormat YYYY
    axisFormat %Y
    section Core
    OAuth 2.0           : 2012, 2013
    OpenID Connect 1.0  : 2014, 2015
    section Modern
    FIDO2 / WebAuthn    : 2019, 2020
    OAuth 2.1 draft     : 2020, 2021
    Passkeys (FIDO)     : 2022, 2023
  `.trim(),

  // ── exotic ───────────────────────────────────────────────────────────────────

  mindmap: `
mindmap
  root((Identity))
    Authentication
      Passwords
      Passkeys
      Biometrics
      Magic Links
    Authorization
      RBAC
      ABAC
      OAuth Scopes
    Protocols
      OAuth 2
      OIDC
      SAML
      FIDO2
  `.trim(),

  quadrant: `
quadrantChart
    title Auth Methods by Security vs Usability
    x-axis Low Usability --> High Usability
    y-axis Low Security --> High Security
    quadrant-1 Sweet spot
    quadrant-2 Secure but painful
    quadrant-3 Avoid
    quadrant-4 Convenient but risky
    Passkeys: [0.85, 0.90]
    Hardware Token: [0.25, 0.97]
    Password + TOTP: [0.50, 0.75]
    SMS OTP: [0.65, 0.55]
    Magic Link: [0.70, 0.65]
    Password only: [0.45, 0.20]
  `.trim(),

  kanban: `
kanban
    todo
        id1[Research PKCE]
        id2[Design token schema]
    inProgress
        id3[Implement /authorize]
        id4[Write unit tests]
    done
        id5[Set up FusionAuth tenant]
  `.trim(),

  // Invalid syntax — should fall back to code block rather than throw.
  invalid: `
flowchart LR
    @@@ not valid mermaid $$$
  `.trim(),
};

// ── tests ─────────────────────────────────────────────────────────────────────

test('flowchart: basic LR', async () => {
  assertSVG(await render(DIAGRAMS.flowchartBasic), 'flowchartBasic');
});

test('flowchart: cluster fills → data-fill-color stripped from !important', async () => {
  const node = await render(DIAGRAMS.flowchartClusters);
  assertSVG(node, 'flowchartClusters');
  // The !important on cluster rects should be stripped and replaced with data-fill-color
  assert.ok(
    node.value.includes('data-fill-color="#999"') || node.value.includes('data-fill-color="#944"'),
    'expected data-fill-color attribute on cluster rect'
  );
  assert.ok(
    !node.value.match(/style="fill:#(?:999|944)\s*!important/),
    'expected !important to be stripped from cluster rect styles'
  );
});

// svgdom measures differently from a browser; these check the layout mermaid computes from it

const labelTranslateX = (svg, nodeId) => {
  const i = svg.indexOf(`flowchart-${nodeId}-`);
  return parseFloat(/<g class="label"[^>]* transform="translate\((-?[\d.]+)/.exec(svg.slice(i))[1]);
};

test('flowchart: multi-word edge labels are centered on their background', async () => {
  const node = await render(DIAGRAMS.flowchartEdgeLabels);
  assertSVG(node, 'flowchartEdgeLabels');
  const labels = [...node.value.matchAll(/<g class="label"[^>]* transform="translate\((-?[\d.]+),[^)]*\)"><g><rect class="background"[^>]* x="(-?[\d.]+)"[^>]* width="([\d.]+)"/g)];
  assert.ok(labels.length >= 3, 'expected edge labels with backgrounds');
  for (const [, dx, x, width] of labels) {
    assert.ok(Math.abs(parseFloat(dx)) < 0.5, `label group should not be shifted, got ${dx}`);
    assert.ok(Math.abs(parseFloat(x) + parseFloat(width) / 2) < 1, 'background should be centered on the text');
  }
});

test('flowchart: multi-line node labels get room for every line', async () => {
  const node = await render('flowchart TD\n  p["`**Proxy**\n  TLS\n  Headers\n  Rate limits`"]');
  assertSVG(node, 'multi-line label');
  const height = parseFloat(/<rect class="basic label-container"[^>]* height="([\d.]+)"/.exec(node.value)[1]);
  assert.ok(height > 4 * 16, `four 16px lines need more than 64px, got ${height}`);
});

test('flowchart: cylinder labels are centered in the shape', async () => {
  const node = await render('flowchart TD\n  db[(Search engine)]');
  assertSVG(node, 'cylinder');
  const dx = labelTranslateX(node.value, 'db');
  assert.ok(Math.abs(dx) < 0.5, `centered text needs no horizontal shift, got ${dx}`);
});

test('sequence diagram: OAuth PKCE flow', async () => {
  assertSVG(await render(DIAGRAMS.sequenceOAuth), 'sequenceOAuth');
});

test('sequence diagram: contains arrowhead marker elements', async () => {
  const node = await render(DIAGRAMS.sequenceOAuth);
  // Sequence diagrams use dynamic marker IDs like mermaid-ssr-0-xxxx-arrowhead
  assert.ok(node.value.includes('arrowhead') || node.value.includes('marker'),
    'expected arrow marker elements in sequence diagram SVG');
});

// alt conditions render as .loopText and else conditions as .sectionTitle, both on the
// diagram background, so each theme must color them like body text, not like label-box text
test('sequence diagram: alt and else conditions are styled for both themes', async () => {
  const node = await render(`
sequenceDiagram
    participant b as Browser
    participant a as App
    alt Known customer
        a -->> b : Redirect
    else Unknown customer
        a -->> b : Same page
    end
  `.trim());
  assertSVG(node, 'alt/else');
  assert.ok(node.value.includes('class="loopText"'), 'alt condition should use .loopText');
  assert.ok(node.value.includes('class="sectionTitle"'), 'else condition should use .sectionTitle');

  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const light = css.slice(css.indexOf('/* --- Light mode'), css.indexOf('/* --- Dark mode'));
  const dark = css.slice(css.indexOf('/* --- Dark mode'));
  const fillFor = (block, cls) => {
    const rule = block.split('\n').find((line) => line.includes(cls) && line.includes('fill:'));
    return rule?.match(/fill:\s*(#[0-9a-f]+)/i)?.[1].toLowerCase();
  };
  for (const cls of ['.loopText', '.sectionTitle']) {
    const lightFill = fillFor(light, cls);
    const darkFill = fillFor(dark, cls);
    assert.ok(lightFill, `${cls} needs a light mode fill`);
    assert.ok(darkFill, `${cls} needs a dark mode fill`);
    assert.equal(lightFill, fillFor(light, '.messageText'), `${cls} should match light mode body text`);
    assert.equal(darkFill, fillFor(dark, '.messageText'), `${cls} should match dark mode body text`);
  }
});

test('state diagram', async () => {
  assertSVG(await render(DIAGRAMS.stateDiagram), 'stateDiagram');
});

test('class diagram', async () => {
  assertSVG(await render(DIAGRAMS.classDiagram), 'classDiagram');
});

test('ER diagram', async () => {
  assertSVG(await render(DIAGRAMS.erDiagram), 'erDiagram');
});

test('pie chart', async () => {
  assertSVG(await render(DIAGRAMS.pieMfa), 'pieMfa');
});

test('gantt chart', async () => {
  const node = await render(DIAGRAMS.gantt);
  assertSVG(node, 'gantt');
  assertText(node, ['Passkeys']);
});

test('quadrant chart', async () => {
  assertSVG(await render(DIAGRAMS.quadrant), 'quadrant');
});

test('kanban', async () => {
  assertSVG(await render(DIAGRAMS.kanban), 'kanban');
});

// one small diagram per remaining type, with a label that must survive rendering
const MORE_TYPES = {
  journey: ['journey\n  title Alpha\n  section Bravo\n    Charlie: 5: Me', 'Charlie'],
  requirement: ['requirementDiagram\n  requirement Alpha {\n    id: 1\n    text: Bravo\n    risk: high\n    verifymethod: test\n  }', 'Alpha'],
  gitGraph: ['gitGraph\n  commit id: "Alpha"\n  branch bravo\n  commit id: "Charlie"', 'Charlie'],
  c4: ['C4Context\n  Person(a, "Alpha")\n  System(b, "Bravo")\n  Rel(a, b, "Charlie")', 'Charlie'],
  timeline: ['timeline\n  title Alpha\n  2024 : Bravo\n  2025 : Charlie', 'Charlie'],
  sankey: ['sankey-beta\n  Alpha,Bravo,10\n  Bravo,Charlie,5', 'Charlie'],
  xychart: ['xychart-beta\n  title "Alpha"\n  x-axis [Bravo, Charlie]\n  bar [1, 2]', 'Charlie'],
  block: ['block-beta\n  columns 2\n  Alpha Bravo', 'Bravo'],
  packet: ['packet-beta\n  0-15: "Alpha"\n  16-31: "Bravo"', 'Bravo'],
  radar: ['radar-beta\n  axis a["Alpha"], b["Bravo"], c["Charlie"]\n  curve x{1,2,3}', 'Charlie'],
  treemap: ['treemap-beta\n  "Alpha"\n    "Bravo": 10\n    "Charlie": 20', 'Charlie'],
};

for (const [type, [src, word]] of Object.entries(MORE_TYPES)) {
  test(`${type} diagram renders its labels`, async () => {
    const node = await render(src);
    assertSVG(node, type);
    assertText(node, [word]);
  });
}

for (const [type, src] of [['mindmap', DIAGRAMS.mindmap], ['architecture-beta', 'architecture-beta\n  service a(server)[Alpha]']]) {
  test(`${type} → skipped with a warning, left as a code block`, async () => {
    const { result: node, warnings } = await withWarnings(() => render(src));
    assert.equal(node.type, 'code');
    assert.ok(warnings.some(w => w.includes(`${type} diagram 1 was skipped`)), JSON.stringify(warnings));
  });
}

test('invalid syntax → falls back to code block, does not throw', async () => {
  const node = await render(DIAGRAMS.invalid);
  assert.equal(node.type, 'code', 'invalid diagram should remain as code block');
  assert.equal(node.lang, 'mermaid', 'lang should be preserved');
  assert.equal(node.value, DIAGRAMS.invalid, 'source should be unchanged');
});

test('data-mermaid-src: HTML special characters are encoded', async () => {
  const src = `flowchart LR\n    A["hello & \\"world\\""] --> B`;
  const node = await render(src);
  // Can't guarantee render succeeds with special chars, but if it does the src must be encoded
  if (node.type === 'html') {
    assert.ok(!node.value.includes('data-mermaid-src="' + src), 'raw src should be encoded');
    assert.ok(node.value.includes('&amp;') || node.value.includes('&quot;') ||
              node.value.includes('data-mermaid-src='),
      'data-mermaid-src should exist with encoded content');
  }
});

test('multiple diagrams in one tree → all processed', async () => {
  const nodes = [
    { type: 'code', lang: 'mermaid', meta: null, value: DIAGRAMS.flowchartBasic },
    { type: 'code', lang: 'mermaid', meta: null, value: DIAGRAMS.pieMfa },
    { type: 'code', lang: 'mermaid', meta: null, value: DIAGRAMS.stateDiagram },
  ];
  const tree = { type: 'root', children: [...nodes] };
  await remarkMermaidSSR({ cache: false })(tree);
  for (const [i, node] of tree.children.entries()) {
    assert.equal(node.type, 'html', `diagram ${i} should be rendered`);
    assert.ok(node.value.includes('<svg'), `diagram ${i} should contain SVG`);
  }
});

test('non-mermaid code blocks → left untouched', async () => {
  const node = { type: 'code', lang: 'javascript', meta: null, value: 'const x = 1;' };
  const tree = { type: 'root', children: [node] };
  await remarkMermaidSSR({ cache: false })(tree);
  assert.equal(tree.children[0].type, 'code');
  assert.equal(tree.children[0].lang, 'javascript');
});

test('theme option → passed to mermaid (no error)', async () => {
  // Just verifies different theme values don't crash.
  for (const theme of ['default', 'dark', 'neutral', 'forest']) {
    const node = await render(DIAGRAMS.pieMfa, { theme });
    assert.equal(node.type, 'html', `theme '${theme}' should produce HTML`);
  }
});

// ── mermaidTitleFix ───────────────────────────────────────────────────────────

test('mermaidTitleFix: adds title node after mermaid block', () => {
  const code = { type: 'code', lang: 'mermaid', meta: 'title="OAuth Flow"', value: 'flowchart LR\n  A-->B' };
  const tree = { type: 'root', children: [code] };
  mermaidTitleFix()(tree);
  assert.equal(tree.children.length, 2);
  const titleNode = tree.children[1];
  assert.equal(titleNode.data.hName, 'p');
  assert.ok('data-title-bottom' in titleNode.data.hProperties, 'mermaid title should be data-title-bottom');
  assert.equal(titleNode.data.hProperties['data-title-bottom'], 'OAuth Flow');
});

test('mermaidTitleFix: leaves non-mermaid blocks alone (rehypeCodeBlocks handles their titles)', () => {
  const code = { type: 'code', lang: 'javascript', meta: 'title="Example"', value: 'const x = 1' };
  const tree = { type: 'root', children: [code] };
  mermaidTitleFix()(tree);
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0], code);
});

test('mermaidTitleFix: no meta → no title node added', () => {
  const code = { type: 'code', lang: 'mermaid', meta: null, value: 'flowchart LR\n  A-->B' };
  const tree = { type: 'root', children: [code] };
  mermaidTitleFix()(tree);
  assert.equal(tree.children.length, 1, 'no title node should be inserted without meta');
});

test('htmlTagInLabel: finds common tags outside sequence diagrams', () => {
  assert.equal(htmlTagInLabel('flowchart LR\n  A["one<br/>two"] --> B'), '<br/>');
  assert.equal(htmlTagInLabel('flowchart LR\n  A["one<br />two"] --> B'), '<br />');
  assert.equal(htmlTagInLabel('flowchart LR\n  A -->|"<b>bold</b>"| B'), '<b>');
  assert.equal(htmlTagInLabel("graph LR\n  A -->|\"<span style='color:red'>x</span>\"| B"), "<span style='color:red'>");
  assert.equal(htmlTagInLabel('stateDiagram-v2\n  S1 : one<br>two'), '<br>');
});

test('htmlTagInLabel: ignores generics, placeholders, arrows, annotations, and sequence diagrams', () => {
  assert.equal(htmlTagInLabel('classDiagram\n  class List~T~\n  class Map["Map<K, V>"]'), null);
  assert.equal(htmlTagInLabel('flowchart LR\n  A["scope ent:<id>"] --> B["List<T>"]'), null);
  assert.equal(htmlTagInLabel('flowchart LR\n  A <--> B\n  C[x < y] --> D'), null);
  assert.equal(htmlTagInLabel('classDiagram\n  class Shape\n  <<interface>> Shape\n  Shape <|-- Circle'), null);
  assert.equal(htmlTagInLabel('sequenceDiagram\n  A ->> B : one<br/>two'), null);
  assert.equal(htmlTagInLabel('%% a <b> comment\nflowchart LR\n  A --> B'), null);
});

test('diagramType: reads the keyword after front matter and comments', () => {
  assert.equal(diagramType('---\ntitle: x\n---\n%% note\nflowchart LR\n  A --> B'), 'flowchart');
  assert.equal(diagramType('  sequenceDiagram\n  A ->> B : x'), 'sequenceDiagram');
});

test('HTML in a label → warns with the document path and diagram', async () => {
  const node = { type: 'code', lang: 'mermaid', meta: null, value: 'flowchart LR\n  A["one<br/>two"] --> B' };
  const { warnings } = await withWarnings(() =>
    remarkMermaidSSR({ cache: false })({ type: 'root', children: [node] }, { path: 'docs/page.mdx' }));
  assert.ok(warnings.some(w => w.includes('docs/page.mdx: flowchart diagram 1 contains <br/>')), JSON.stringify(warnings));
});

test('failed render → warning names the document and keeps the parse error context', async () => {
  const node = { type: 'code', lang: 'mermaid', meta: null, value: DIAGRAMS.invalid };
  const { warnings } = await withWarnings(() =>
    remarkMermaidSSR({ cache: false })({ type: 'root', children: [node] }, { path: 'docs/broken.mdx' }));
  const warning = warnings.find(w => w.includes('docs/broken.mdx'));
  assert.ok(warning?.includes('failed to render, so the page shows the source instead'), JSON.stringify(warnings));
  assert.ok(warning.split('\n').length > 1, 'expected the error detail on following lines');
});
