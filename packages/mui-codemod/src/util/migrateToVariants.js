const MAX_DEPTH = 20;
/**
 *
 * @param {import('jscodeshift').API['j']} j
 * @param {any[]} styles
 */
export default function migrateToVariants(j, styles) {
  function createBuildStyle(key, upperBuildStyle, applyStylesMode) {
    if (applyStylesMode) {
      upperBuildStyle = (styleExpression) =>
        j.objectExpression([
          j.spreadElement(
            j.callExpression(
              j.memberExpression(j.identifier('theme'), j.identifier('applyStyles')),
              [j.stringLiteral(applyStylesMode), styleExpression],
            ),
          ),
        ]);
    }
    return function buildStyle(styleExpression) {
      if (key) {
        if (key.type === 'Identifier' || key.type === 'StringLiteral') {
          return upperBuildStyle(j.objectExpression([j.objectProperty(key, styleExpression)]));
        }
        if (key.type === 'TemplateLiteral' || key.type === 'CallExpression') {
          return upperBuildStyle(
            j.objectExpression([
              {
                ...j.objectProperty(key, styleExpression),
                computed: true,
              },
            ]),
          );
        }
      }
      return upperBuildStyle ? upperBuildStyle(styleExpression) : styleExpression;
    };
  }

  /**
   *
   * @param {import('ast-types').namedTypes.MemberExpression | import('ast-types').namedTypes.Identifier} node
   */
  function getIdentifierKey(node) {
    if (node.type === 'MemberExpression') {
      return node.property;
    }
    return node;
  }

  /**
   *
   * @param {import('ast-types').namedTypes.UnaryExpression | import('ast-types').namedTypes.MemberExpression | import('ast-types').namedTypes.Identifier} node
   */
  function getObjectKey(node) {
    let tempNode = { ...node };
    while (tempNode.type === 'UnaryExpression') {
      tempNode = tempNode.argument;
    }
    while (tempNode.type === 'MemberExpression') {
      tempNode = tempNode.object;
    }
    return tempNode;
  }

  /**
   *
   * @param {import('ast-types').namedTypes.ObjectExpression} objectExpression
   * @param {import('ast-types').namedTypes.BinaryExpression} addtional
   */
  function objectToArrowFunction(objectExpression, addtional) {
    const paramKeys = new Set();
    let left;
    objectExpression.properties.forEach((prop, index) => {
      paramKeys.add(prop.key.name);
      const result = j.binaryExpression('===', prop.key, prop.value);
      if (index === 0) {
        left = result;
      } else {
        left = j.logicalExpression('&&', left, result);
      }
    });
    if (addtional) {
      paramKeys.add(getObjectKey(addtional.left).name);
    }
    return buildArrowFunctionAST(
      paramKeys,
      addtional ? j.logicalExpression('&&', left, addtional) : left,
    );
  }

  /**
   *
   * @param {import('ast-types').namedTypes.Identifier | import('ast-types').namedTypes.BinaryExpression | import('ast-types').namedTypes.UnaryExpression | import('ast-types').namedTypes.MemberExpression} node
   */
  function inverseBinaryExpression(node) {
    if (node.type === 'Identifier' || node.type === 'MemberExpression') {
      return j.unaryExpression('!', node);
    }
    if (node.operator === '===') {
      return { ...node, operator: '!==' };
    }
    if (node.operator === '!==') {
      return { ...node, operator: '===' };
    }
    if (node.operator === '!') {
      if (node.argument?.operator === '!') {
        return node.argument;
      }
      return j.unaryExpression('!', node);
    }
    return node;
  }

  /**
   *
   * @param {import('ast-types').namedTypes.ObjectExpression} node
   */
  function removeProperty(parentNode, child) {
    if (parentNode) {
      if (parentNode.type === 'ObjectExpression') {
        parentNode.properties = parentNode.properties.filter(
          (prop) => prop !== child && prop.value !== child,
        );
      }
    }
  }

  function buildObjectAST(jsObject) {
    const result = j.objectExpression([]);
    Object.entries(jsObject).forEach(([key, value]) => {
      result.properties.push(j.objectProperty(j.identifier(key), value));
    });
    return result;
  }

  function buildArrowFunctionAST(params, body) {
    return j.arrowFunctionExpression(
      [
        j.objectPattern(
          [...params].map((k) => ({
            ...j.objectProperty(j.identifier(k), j.identifier(k)),
            shorthand: true,
          })),
        ),
      ],
      body,
    );
  }

  /**
   *
   * @param {{ properties: any[] }} node
   * @param {Record<string, any[] | import('ast-types').namedTypes.ObjectExpression>} modeStyles
   */
  function appendPaletteModeStyles(node, modeStyles) {
    Object.entries(modeStyles).forEach(([mode, objectStyles]) => {
      node.properties.push(
        j.spreadElement(
          j.callExpression(j.memberExpression(j.identifier('theme'), j.identifier('applyStyles')), [
            j.stringLiteral(mode),
            Array.isArray(objectStyles) ? j.objectExpression(objectStyles) : objectStyles,
          ]),
        ),
      );
    });
  }

  /**
   *
   * @param {import('ast-types').namedTypes.LogicalExpression | import('ast-types').namedTypes.BinaryExpression | import('ast-types').namedTypes.UnaryExpression | import('ast-types').namedTypes.MemberExpression} node
   */
  function buildProps(node) {
    const properties = [];
    const variables = new Set();
    let isAllEqual = true;
    let tempNode = { ...node };
    function assignProperties(_node) {
      if (_node.type === 'BinaryExpression') {
        variables.add(getObjectKey(_node.left).name);
        if (_node.operator === '===') {
          properties.push(j.objectProperty(getIdentifierKey(_node.left), _node.right));
        } else {
          isAllEqual = false;
        }
      }
      if (_node.type === 'MemberExpression' || _node.type === 'Identifier') {
        isAllEqual = false;
        variables.add(getObjectKey(_node).name);
      }
      if (_node.type === 'UnaryExpression') {
        isAllEqual = false;
        if (_node.argument.type === 'UnaryExpression') {
          // handle `!!variable`
          variables.add(getObjectKey(_node.argument.argument).name);
        } else {
          // handle `!variable`
          variables.add(getObjectKey(_node.argument).name);
        }
      }
    }
    let counter = 0;
    if (tempNode.type !== 'LogicalExpression') {
      assignProperties(tempNode);
    } else {
      while (tempNode.type === 'LogicalExpression' && counter < MAX_DEPTH) {
        counter += 1;
        if (tempNode.operator !== '&&') {
          isAllEqual = false;
        }

        assignProperties(tempNode.right);
        if (tempNode.left.type !== 'LogicalExpression') {
          assignProperties(tempNode.left);
          break;
        }

        tempNode = { ...tempNode.left };
      }
    }

    if (!isAllEqual) {
      return buildArrowFunctionAST(variables, node);
    }
    return j.objectExpression(properties);
  }

  function mergeProps(parentProps, currentProps) {
    if (parentProps.type === 'ObjectExpression' && currentProps.type === 'ObjectExpression') {
      return j.objectExpression([...parentProps.properties, ...currentProps.properties]);
    }
    const parentArrow =
      parentProps.type === 'ObjectExpression' ? objectToArrowFunction(parentProps) : parentProps;
    const currentArrow =
      currentProps.type === 'ObjectExpression' ? objectToArrowFunction(currentProps) : currentProps;
    const variables = new Set();
    [...parentArrow.params[0].properties, ...currentArrow.params[0].properties].forEach((param) => {
      variables.add(param.key.name);
    });
    return buildArrowFunctionAST(
      variables,
      j.logicalExpression('&&', parentArrow.body, currentArrow.body),
    );
  }

  function isThemePaletteMode(node) {
    return (
      node.type === 'MemberExpression' &&
      node.object.type === 'MemberExpression' &&
      node.object.object.name === 'theme' &&
      node.object.property.name === 'palette' &&
      node.property.name === 'mode'
    );
  }

  // 2. Find logical spread expressions to convert to variants
  styles.forEach((style) => {
    const parameters = new Set();
    style.params.forEach((param) => {
      if (param.type === 'ObjectPattern') {
        param.properties.forEach((prop) => {
          parameters.add(prop.key.name);
        });
      }
    });
    const variants = [];

    if (style.body.type === 'LogicalExpression') {
      if (
        style.params[0] &&
        style.params[0].type === 'ObjectPattern' &&
        style.params[0].properties.some((prop) => prop.key.name !== 'theme')
      ) {
        // case: ({ theme, ownerState }) => ownerState.variant === 'regular' && theme.mixins.toolbar
        style.body = j.objectExpression([
          j.objectProperty(
            j.identifier('variants'),
            j.arrayExpression([
              j.objectExpression([
                j.objectProperty(j.identifier('props'), buildProps(style.body.left)),
                j.objectProperty(j.identifier('style'), style.body.right),
              ]),
            ]),
          ),
        ]);
      }
    } else if (style.body.type === 'ConditionalExpression') {
      // skip ConditionalExpression
    } else {
      let objectExpression = style.body;
      let counter = 0;
      while (objectExpression.type !== 'ObjectExpression' && counter < MAX_DEPTH) {
        counter += 1;
        if (objectExpression.type === 'BlockStatement') {
          objectExpression = objectExpression.body.find(
            (item) => item.type === 'ReturnStatement',
          ).argument;
        }
      }

      recurseObjectExpression({ node: objectExpression, buildStyle: createBuildStyle() });

      if (variants.length) {
        objectExpression.properties.push(
          j.objectProperty(
            j.identifier('variants'),
            j.arrayExpression(
              variants.filter((variant) => {
                const props = variant.properties.find((prop) => prop.key.name === 'props');
                const styleVal = variant.properties.find((prop) => prop.key.name === 'style');
                return (
                  props &&
                  styleVal &&
                  (!styleVal.value.properties || styleVal.value.properties.length > 0) &&
                  (props.value.type === 'ArrowFunctionExpression' ||
                    props.value.properties.length > 0)
                );
              }),
            ),
          ),
        );
      }
    }

    function recurseObjectExpression(data) {
      if (data.node.type === 'ObjectExpression') {
        const modeStyles = {}; // to collect styles from `theme.palette.mode === '...'`
        data.node.properties.forEach((prop) => {
          if (prop.type === 'ObjectProperty') {
            recurseObjectExpression({
              ...data,
              node: prop.value,
              parentNode: data.node,
              key: prop.key,
              buildStyle: createBuildStyle(prop.key, data.buildStyle),
              replaceValue: (newValue) => {
                prop.value = newValue;
              },
              modeStyles,
            });
          } else {
            recurseObjectExpression({
              ...data,
              node: prop,
              parentNode: data.node,
              buildStyle: createBuildStyle(prop.key, data.buildStyle),
            });
          }
        });
        appendPaletteModeStyles(data.node, modeStyles);
      }
      if (data.node.type === 'SpreadElement') {
        if (data.node.argument.type === 'LogicalExpression') {
          const paramName =
            data.node.argument.left.type === 'BinaryExpression'
              ? getObjectKey(data.node.argument.left.left)?.name
              : getObjectKey(data.node.argument.left)?.name;
          if (paramName === 'theme' && data.node.argument.left.right.type === 'StringLiteral') {
            if (data.node.argument.right.type === 'ObjectExpression') {
              const mode = data.node.argument.left.right.value;
              data.node.argument.right.properties.forEach((prop) => {
                if (prop.type === 'ObjectProperty') {
                  recurseObjectExpression({
                    ...data,
                    node: prop.value,
                    parentNode: data.node.argument.right,
                    key: prop.key,
                    buildStyle: createBuildStyle(prop.key, data.buildStyle, mode),
                    replaceValue: (newValue) => {
                      prop.value = newValue;
                    },
                  });
                } else {
                  recurseObjectExpression({
                    ...data,
                    node: prop,
                    parentNode: data.node.argument.right,
                    buildStyle: createBuildStyle(prop.key, data.buildStyle, mode),
                  });
                }
              });
              appendPaletteModeStyles(data.parentNode, {
                [mode]: data.node.argument.right,
              });
            }
            removeProperty(data.parentNode, data.node);
            return;
          }
          if (paramName && !parameters.has(paramName)) {
            return;
          }

          const scopeProps = buildProps(data.node.argument.left);
          const variant = {
            props: data.props ? mergeProps(data.props, scopeProps) : scopeProps,
            style: data.node.argument.right,
          };

          const lastLength = variants.push({}); // preserve the order of the recursive calls

          const modeStyles = {}; // to collect styles from `theme.palette.mode === '...'`
          if (variant.style.type === 'ObjectExpression') {
            variant.style.properties.forEach((prop) => {
              if (prop.type === 'ObjectProperty') {
                recurseObjectExpression({
                  ...data,
                  node: prop.value,
                  parentNode: variant.style,
                  props: variant.props,
                  key: prop.key,
                  buildStyle: createBuildStyle(prop.key, data.buildStyle),
                  replaceValue: (newValue) => {
                    prop.value = newValue;
                  },
                  modeStyles,
                });
              } else {
                recurseObjectExpression({
                  ...data,
                  node: prop,
                  parentNode: variant.style,
                  props: variant.props,
                  buildStyle: createBuildStyle(prop.key, data.buildStyle),
                });
              }
            });
          }
          appendPaletteModeStyles(variant.style, modeStyles);
          variant.style = data.buildStyle(variant.style);
          variants[lastLength - 1] = buildObjectAST(variant);
          removeProperty(data.parentNode, data.node);
        }
        if (data.node.argument.type === 'ConditionalExpression') {
          recurseObjectExpression({
            ...data,
            node: data.node.argument,
            parentNode: data.node,
          });
          removeProperty(data.parentNode, data.node);
        }
      }
      if (data.node.type === 'ConditionalExpression') {
        if (
          data.node.test.type === 'BinaryExpression' ||
          data.node.test.type === 'UnaryExpression' ||
          data.node.test.type === 'Identifier' ||
          data.node.test.type === 'MemberExpression'
        ) {
          let leftName = getObjectKey(data.node.test)?.name;
          if (data.node.test.left) {
            leftName = getObjectKey(data.node.test.left)?.name;
          }
          if (data.node.test.argument) {
            leftName = getObjectKey(data.node.test.argument)?.name;
          }
          if (parameters.has(leftName) && leftName !== 'theme') {
            let props = buildProps(data.node.test);
            if (data.props) {
              props = mergeProps(data.props, props);
            }
            const styleVal = data.buildStyle(data.node.consequent);
            const variant = {
              props,
              style: styleVal,
            };
            variants.push(buildObjectAST(variant));

            // create another variant with inverted condition
            let props2 = buildProps(inverseBinaryExpression(data.node.test));
            if (data.props) {
              props2 = mergeProps(data.props, props2);
            }
            const styleVal2 = data.buildStyle(data.node.alternate);
            const variant2 = {
              props: props2,
              style: styleVal2,
            };
            variants.push(buildObjectAST(variant2));
            if (data.parentNode?.type === 'ObjectExpression') {
              removeProperty(data.parentNode, data.node);
            }
          }
          if (
            leftName === 'theme' &&
            data.parentNode?.type === 'ObjectExpression' &&
            data.node.test?.type === 'BinaryExpression' &&
            isThemePaletteMode(data.node.test.left)
          ) {
            if (
              data.node.consequent.type !== 'ObjectExpression' &&
              data.node.alternate.type !== 'ObjectExpression'
            ) {
              if (data.modeStyles) {
                if (!data.modeStyles[data.node.test.right.value]) {
                  data.modeStyles[data.node.test.right.value] = [];
                }
                data.modeStyles[data.node.test.right.value].push(
                  j.objectProperty(data.key, data.node.consequent),
                );
              }
              data.replaceValue?.(data.node.alternate);
            }
          }
        }
      }
      if (data.node.type === 'TemplateLiteral') {
        if (data.parentNode?.type === 'ObjectExpression') {
          const modeStyles = {};
          data.node.expressions.forEach((expression, index) => {
            recurseObjectExpression({
              ...data,
              node: expression,
              parentNode: data.parentNode,
              buildStyle: createBuildStyle(data.key, data.buildStyle),
              replaceValue: (newValue) => {
                data.node.expressions[index] = newValue;
              },
              modeStyles,
            });
          });
          if (data.modeStyles) {
            Object.entries(modeStyles).forEach(([mode, objectStyles]) => {
              const clonedNode = {
                ...data.node,
                expressions: data.node.expressions.map((expression) => ({ ...expression })),
              };
              clonedNode.expressions = objectStyles.map((item) => item.value);

              if (!data.modeStyles[mode]) {
                data.modeStyles[mode] = [];
              }
              data.modeStyles[mode].push(j.objectProperty(data.key, clonedNode));
            });
          }
        }
      }
      if (
        data.key &&
        data.key.type === 'Identifier' &&
        data.node.type === 'MemberExpression' &&
        data.node.object.type === 'ObjectExpression' &&
        parameters.has(getObjectKey(data.node.property).name)
      ) {
        data.node.object.properties.forEach((prop) => {
          variants.push(
            buildObjectAST({
              props: j.objectExpression([
                j.objectProperty(
                  getIdentifierKey(data.node.property),
                  j.stringLiteral(prop.key.name),
                ),
              ]),
              style: data.buildStyle(prop.value),
            }),
          );
        });
        removeProperty(data.parentNode, data.node);
      }
    }

    style.params.forEach((param) => {
      if (param.type === 'ObjectPattern') {
        param.properties = param.properties.filter((prop) => prop.key.name === 'theme');
      }
    });

    if (style.body.type === 'ObjectExpression') {
      // Remove empty `...theme.applyStyles('...', {})`
      style.body.properties = style.body.properties.filter((prop) => {
        if (
          prop.argument?.callee?.object?.name === 'theme' &&
          typeof prop.argument?.arguments[0]?.value === 'string' &&
          !prop.argument?.arguments?.[1]?.properties?.length
        ) {
          return false;
        }
        return true;
      });
    }
  });
}
