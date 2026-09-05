# Contributing

The most useful thing you can send is a browser this scores wrongly. Say which reading it got wrong
and what the browser actually returns, and there is a form for that under
[New issue](https://github.com/seyedehsanhadi/privacyassay/issues/new/choose).

Disagreeing with the method is just as welcome, in a normal issue. The weights are judgment rather
than measured entropy, and [`bench/`](bench/) recomputes the calibration and the sensitivity analysis
from historical captures. Those older results do not validate current browser rankings.

Two things the test suite enforces, worth knowing before a pull request:

- `index.html` carries the licence header and section markers, and no other comments. The reason behind a fix belongs in the
  test that pins it.
- Any number stated in prose is checked against the code that produces it, so changing a value in one
  place fails the build in the other.

```bash
npm test && npm run test:browser && npm run test:stress
```

Security reports go through [SECURITY.md](SECURITY.md) rather than a public issue.
