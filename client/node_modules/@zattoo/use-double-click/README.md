# useDoubleClick

[React hook][0] for continuous double-clicks and combining click and double-click events

See [Repeatable double-click and hybrid clicks solution with useDoubleClick hook][1] article for more details.

### Install

```shell
npm i @zattoo/use-double-click --save --save-exact
```

### Usage

```jsx
export const Example = () => {
    const [doubleClickCount, setDoubleClickCount] = useState(0);
    const [clickCount, setClickCount] = useState(0);

    const hybridClick = useDoubleClick(
        () => setDoubleClickCount(doubleClickCount + 1),
        () => setClickCount(clickCount + 1),
    );

    return (
        <section>
            <p>You clicked {clickCount} times</p>
            <p>You double-clicked {doubleClickCount} times</p>
            <button
                type="button"
                onClick={hybridClick}
            >
                Click me
            </button>
        </section>
    );
}
```

### Parameters
- `doubleClick: (event? React.SyntheticEvent) => void` - double-click function to be executed when user double-clicks (single or multiple times) on the bounded component.
- `click?: (event? React.SyntheticEvent) => void` - click function to be executed when user clicks (single time) on the bounded component.
- `options?: Object`
    - `timeout?: number` - number of milliseconds to detect double-click event

[0]: https://reactjs.org/docs/hooks-intro.html
[1]: https://medium.com/@nitzan.nashi/repeatable-double-click-and-hybrid-clicks-solution-with-usedoubleclick-hook-c6c64449abf7?sk=ed5c9edf3017fb2b7b277b76217fc393
