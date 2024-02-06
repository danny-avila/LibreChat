'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var utils = require('./utils.js');

const Panel = utils.styled('div', (_props, theme) => ({
  fontSize: 'clamp(12px, 1.5vw, 14px)',
  fontFamily: "sans-serif",
  display: 'flex',
  backgroundColor: theme.background,
  color: theme.foreground
}), {
  '(max-width: 700px)': {
    flexDirection: 'column'
  },
  '(max-width: 600px)': {
    fontSize: '.9em' // flexDirection: 'column',

  }
});
const ActiveQueryPanel = utils.styled('div', () => ({
  flex: '1 1 500px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'auto',
  height: '100%'
}), {
  '(max-width: 700px)': (_props, theme) => ({
    borderTop: "2px solid " + theme.gray
  })
});
const Button = utils.styled('button', (props, theme) => ({
  appearance: 'none',
  fontSize: '.9em',
  fontWeight: 'bold',
  background: theme.gray,
  border: '0',
  borderRadius: '.3em',
  color: 'white',
  padding: '.5em',
  opacity: props.disabled ? '.5' : undefined,
  cursor: 'pointer'
}));
const QueryKeys = utils.styled('span', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5em',
  fontSize: '0.9em'
});
const QueryKey = utils.styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '.2em .4em',
  fontWeight: 'bold',
  textShadow: '0 0 10px black',
  borderRadius: '.2em'
});
const Code = utils.styled('code', {
  fontSize: '.9em',
  color: 'inherit',
  background: 'inherit'
});
const Input = utils.styled('input', (_props, theme) => ({
  backgroundColor: theme.inputBackgroundColor,
  border: 0,
  borderRadius: '.2em',
  color: theme.inputTextColor,
  fontSize: '.9em',
  lineHeight: "1.3",
  padding: '.3em .4em'
}));
const Select = utils.styled('select', (_props, theme) => ({
  display: "inline-block",
  fontSize: ".9em",
  fontFamily: "sans-serif",
  fontWeight: 'normal',
  lineHeight: "1.3",
  padding: ".3em 1.5em .3em .5em",
  height: 'auto',
  border: 0,
  borderRadius: ".2em",
  appearance: "none",
  WebkitAppearance: 'none',
  backgroundColor: theme.inputBackgroundColor,
  backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%23444444'><polygon points='0,25 100,25 50,75'/></svg>\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right .55em center",
  backgroundSize: ".65em auto, 100%",
  color: theme.inputTextColor
}), {
  '(max-width: 500px)': {
    display: 'none'
  }
});

exports.ActiveQueryPanel = ActiveQueryPanel;
exports.Button = Button;
exports.Code = Code;
exports.Input = Input;
exports.Panel = Panel;
exports.QueryKey = QueryKey;
exports.QueryKeys = QueryKeys;
exports.Select = Select;
//# sourceMappingURL=styledComponents.js.map
