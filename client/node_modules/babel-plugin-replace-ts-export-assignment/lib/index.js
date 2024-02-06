"use strict";
module.exports = ({ template }) => {
    const moduleExportsDeclaration = template(`
    module.exports = ASSIGNMENT;
  `);
    return {
        name: 'replace-ts-export-assignment',
        visitor: {
            TSExportAssignment(path) {
                path.replaceWith(moduleExportsDeclaration({ ASSIGNMENT: path.node.expression }));
            }
        }
    };
};
//# sourceMappingURL=index.js.map