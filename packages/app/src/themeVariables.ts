import { Uniwind } from 'uniwind';

import { palette } from './palette';

const darkHoverThemeVariables = {
    '--color-default-hover': '#202a36',
    '--color-accent-hover': palette.blue,
    '--color-success-hover': palette.green,
    '--color-warning-hover': palette.amber,
    '--color-danger-hover': palette.red,
    '--color-danger-soft-hover': palette.redSoft,
};

const lightHoverThemeVariables = {
    '--color-default-hover': '#e5e7eb',
    '--color-accent-hover': '#1d4ed8',
    '--color-success-hover': '#16a34a',
    '--color-warning-hover': '#d97706',
    '--color-danger-hover': '#dc2626',
    '--color-danger-soft-hover': 'rgba(244,63,94,0.14)',
};

let registered = false;

export function registerAppThemeVariables() {
    if (registered) {
        return;
    }

    registered = true;
    Uniwind.updateCSSVariables('dark', darkHoverThemeVariables);
    Uniwind.updateCSSVariables('light', lightHoverThemeVariables);
}
