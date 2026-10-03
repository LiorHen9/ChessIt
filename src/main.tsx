import { render } from 'preact';
import { App } from './app/App';
import { installErrorLog } from './app/errorLog';
import './styles.css';

installErrorLog();
render(<App />, document.getElementById('app')!);
