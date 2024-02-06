//@flow
import defineFunction from "../defineFunction";

defineFunction({
    type: "internal",
    names: ["\\relax"],
    props: {
        numArgs: 0,
        allowedInText: true,
    },
    handler({parser}) {
        return {
            type: "internal",
            mode: parser.mode,
        };
    },
});
