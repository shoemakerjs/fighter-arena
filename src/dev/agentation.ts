// Dev only (loaded from main.ts behind import.meta.env.DEV): the Agentation toolbar for
// leaving visual feedback on the page. React lives here alone; the game itself doesn't use it.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Agentation } from 'agentation';

const host = document.createElement('div');
host.id = 'agentation-root';
document.body.append(host);
createRoot(host).render(createElement(Agentation));
