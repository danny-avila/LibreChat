// @flow
import defineFunction, {ordargument} from "../defineFunction";
import buildCommon from "../buildCommon";
import {assertNodeType} from "../parseNode";
import ParseError from "../ParseError";

import * as html from "../buildHTML";
import * as mml from "../buildMathML";

defineFunction({
    type: "html",
    names: ["\\htmlClass", "\\htmlId", "\\htmlStyle", "\\htmlData"],
    props: {
        numArgs: 2,
        argTypes: ["raw", "original"],
        allowedInText: true,
    },
    handler: ({parser, funcName, token}, args) => {
        const value = assertNodeType(args[0], "raw").string;
        const body = args[1];

        if (parser.settings.strict) {
            parser.settings.reportNonstrict("htmlExtension",
                "HTML extension is disabled on strict mode");
        }

        let trustContext;
        const attributes = {};

        switch (funcName) {
            case "\\htmlClass":
                attributes.class = value;
                trustContext = {
                    command: "\\htmlClass",
                    class: value,
                };
                break;
            case "\\htmlId":
                attributes.id = value;
                trustContext = {
                    command: "\\htmlId",
                    id: value,
                };
                break;
            case "\\htmlStyle":
                attributes.style = value;
                trustContext = {
                    command: "\\htmlStyle",
                    style: value,
                };
                break;
            case "\\htmlData": {
                const data = value.split(",");
                for (let i = 0; i < data.length; i++) {
                    const keyVal = data[i].split("=");
                    if (keyVal.length !== 2) {
                        throw new ParseError(
                            "Error parsing key-value for \\htmlData");
                    }
                    attributes["data-" + keyVal[0].trim()] = keyVal[1].trim();
                }

                trustContext = {
                    command: "\\htmlData",
                    attributes,
                };
                break;
            }
            default:
                throw new Error("Unrecognized html command");
        }

        if (!parser.settings.isTrusted(trustContext)) {
            return parser.formatUnsupportedCmd(funcName);
        }
        return {
            type: "html",
            mode: parser.mode,
            attributes,
            body: ordargument(body),
        };
    },
    htmlBuilder: (group, options) => {
        const elements = html.buildExpression(group.body, options, false);

        const classes = ["enclosing"];
        if (group.attributes.class) {
            classes.push(...group.attributes.class.trim().split(/\s+/));
        }

        const span = buildCommon.makeSpan(classes, elements, options);
        for (const attr in group.attributes) {
            if (attr !== "class" && group.attributes.hasOwnProperty(attr)) {
                span.setAttribute(attr, group.attributes[attr]);
            }
        }
        return span;
    },
    mathmlBuilder: (group, options) => {
        return mml.buildExpressionRow(group.body, options);
    },
});
