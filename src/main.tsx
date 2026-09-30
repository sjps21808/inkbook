import { render } from 'preact';
import { App } from './app';
import { loadDebugTools } from './debug';
import './app.css';

void loadDebugTools(location.search);
render(<App />, document.getElementById('app')!);
