import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// waitFor/findBy poll until the UI settles and return as soon as it does; the
// 1 s default runs out on a starved host (several suites at once) and fails
// tests that are only slow. A UI that never settles still fails.
configure({ asyncUtilTimeout: 10_000 });
