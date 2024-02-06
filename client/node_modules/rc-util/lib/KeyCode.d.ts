/**
 * @ignore
 * some key-codes definition and utils from closure-library
 * @author yiminghe@gmail.com
 */
declare const KeyCode: {
    /**
     * MAC_ENTER
     */
    MAC_ENTER: number;
    /**
     * BACKSPACE
     */
    BACKSPACE: number;
    /**
     * TAB
     */
    TAB: number;
    /**
     * NUMLOCK on FF/Safari Mac
     */
    NUM_CENTER: number;
    /**
     * ENTER
     */
    ENTER: number;
    /**
     * SHIFT
     */
    SHIFT: number;
    /**
     * CTRL
     */
    CTRL: number;
    /**
     * ALT
     */
    ALT: number;
    /**
     * PAUSE
     */
    PAUSE: number;
    /**
     * CAPS_LOCK
     */
    CAPS_LOCK: number;
    /**
     * ESC
     */
    ESC: number;
    /**
     * SPACE
     */
    SPACE: number;
    /**
     * PAGE_UP
     */
    PAGE_UP: number;
    /**
     * PAGE_DOWN
     */
    PAGE_DOWN: number;
    /**
     * END
     */
    END: number;
    /**
     * HOME
     */
    HOME: number;
    /**
     * LEFT
     */
    LEFT: number;
    /**
     * UP
     */
    UP: number;
    /**
     * RIGHT
     */
    RIGHT: number;
    /**
     * DOWN
     */
    DOWN: number;
    /**
     * PRINT_SCREEN
     */
    PRINT_SCREEN: number;
    /**
     * INSERT
     */
    INSERT: number;
    /**
     * DELETE
     */
    DELETE: number;
    /**
     * ZERO
     */
    ZERO: number;
    /**
     * ONE
     */
    ONE: number;
    /**
     * TWO
     */
    TWO: number;
    /**
     * THREE
     */
    THREE: number;
    /**
     * FOUR
     */
    FOUR: number;
    /**
     * FIVE
     */
    FIVE: number;
    /**
     * SIX
     */
    SIX: number;
    /**
     * SEVEN
     */
    SEVEN: number;
    /**
     * EIGHT
     */
    EIGHT: number;
    /**
     * NINE
     */
    NINE: number;
    /**
     * QUESTION_MARK
     */
    QUESTION_MARK: number;
    /**
     * A
     */
    A: number;
    /**
     * B
     */
    B: number;
    /**
     * C
     */
    C: number;
    /**
     * D
     */
    D: number;
    /**
     * E
     */
    E: number;
    /**
     * F
     */
    F: number;
    /**
     * G
     */
    G: number;
    /**
     * H
     */
    H: number;
    /**
     * I
     */
    I: number;
    /**
     * J
     */
    J: number;
    /**
     * K
     */
    K: number;
    /**
     * L
     */
    L: number;
    /**
     * M
     */
    M: number;
    /**
     * N
     */
    N: number;
    /**
     * O
     */
    O: number;
    /**
     * P
     */
    P: number;
    /**
     * Q
     */
    Q: number;
    /**
     * R
     */
    R: number;
    /**
     * S
     */
    S: number;
    /**
     * T
     */
    T: number;
    /**
     * U
     */
    U: number;
    /**
     * V
     */
    V: number;
    /**
     * W
     */
    W: number;
    /**
     * X
     */
    X: number;
    /**
     * Y
     */
    Y: number;
    /**
     * Z
     */
    Z: number;
    /**
     * META
     */
    META: number;
    /**
     * WIN_KEY_RIGHT
     */
    WIN_KEY_RIGHT: number;
    /**
     * CONTEXT_MENU
     */
    CONTEXT_MENU: number;
    /**
     * NUM_ZERO
     */
    NUM_ZERO: number;
    /**
     * NUM_ONE
     */
    NUM_ONE: number;
    /**
     * NUM_TWO
     */
    NUM_TWO: number;
    /**
     * NUM_THREE
     */
    NUM_THREE: number;
    /**
     * NUM_FOUR
     */
    NUM_FOUR: number;
    /**
     * NUM_FIVE
     */
    NUM_FIVE: number;
    /**
     * NUM_SIX
     */
    NUM_SIX: number;
    /**
     * NUM_SEVEN
     */
    NUM_SEVEN: number;
    /**
     * NUM_EIGHT
     */
    NUM_EIGHT: number;
    /**
     * NUM_NINE
     */
    NUM_NINE: number;
    /**
     * NUM_MULTIPLY
     */
    NUM_MULTIPLY: number;
    /**
     * NUM_PLUS
     */
    NUM_PLUS: number;
    /**
     * NUM_MINUS
     */
    NUM_MINUS: number;
    /**
     * NUM_PERIOD
     */
    NUM_PERIOD: number;
    /**
     * NUM_DIVISION
     */
    NUM_DIVISION: number;
    /**
     * F1
     */
    F1: number;
    /**
     * F2
     */
    F2: number;
    /**
     * F3
     */
    F3: number;
    /**
     * F4
     */
    F4: number;
    /**
     * F5
     */
    F5: number;
    /**
     * F6
     */
    F6: number;
    /**
     * F7
     */
    F7: number;
    /**
     * F8
     */
    F8: number;
    /**
     * F9
     */
    F9: number;
    /**
     * F10
     */
    F10: number;
    /**
     * F11
     */
    F11: number;
    /**
     * F12
     */
    F12: number;
    /**
     * NUMLOCK
     */
    NUMLOCK: number;
    /**
     * SEMICOLON
     */
    SEMICOLON: number;
    /**
     * DASH
     */
    DASH: number;
    /**
     * EQUALS
     */
    EQUALS: number;
    /**
     * COMMA
     */
    COMMA: number;
    /**
     * PERIOD
     */
    PERIOD: number;
    /**
     * SLASH
     */
    SLASH: number;
    /**
     * APOSTROPHE
     */
    APOSTROPHE: number;
    /**
     * SINGLE_QUOTE
     */
    SINGLE_QUOTE: number;
    /**
     * OPEN_SQUARE_BRACKET
     */
    OPEN_SQUARE_BRACKET: number;
    /**
     * BACKSLASH
     */
    BACKSLASH: number;
    /**
     * CLOSE_SQUARE_BRACKET
     */
    CLOSE_SQUARE_BRACKET: number;
    /**
     * WIN_KEY
     */
    WIN_KEY: number;
    /**
     * MAC_FF_META
     */
    MAC_FF_META: number;
    /**
     * WIN_IME
     */
    WIN_IME: number;
    /**
     * whether text and modified key is entered at the same time.
     */
    isTextModifyingKeyEvent: (e: KeyboardEvent) => boolean;
    /**
     * whether character is entered.
     */
    isCharacterKey: (keyCode: number) => boolean;
};
export default KeyCode;
