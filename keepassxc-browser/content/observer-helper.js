'use strict';

const MAX_CHILDREN = 50;
const MAX_INPUTS = 100;
const MAX_MUTATIONS = 200;

MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

/**
 * @Object kpxcObserverHelper
 * MutationObserver handler for dynamically added input fields.
 */
const kpxcObserverHelper = {};
kpxcObserverHelper.ignoredNodeNames = [
    'g',
    'path',
    'svg',
    'A',
    'HEAD',
    'HTML',
    'LABEL',
    'LINK',
    'SCRIPT',
    'SPAN',
    'VIDEO',
];

kpxcObserverHelper.ignoredNodeTypes = [
    Node.ATTRIBUTE_NODE,
    Node.TEXT_NODE,
    Node.CDATA_SECTION_NODE,
    Node.PROCESSING_INSTRUCTION_NODE,
    Node.COMMENT_NODE,
    Node.DOCUMENT_TYPE_NODE,
    Node.NOTATION_NODE
];

kpxcObserverHelper.inputTypes = [
    'text',
    'email',
    'password',
    'tel',
    'number',
    'username', // Note: Not a standard
    undefined, // Input field can be without any type. Include this and null to the list.
    null
];

// Define what element should be observed by the observer
// and what types of mutations trigger the callback
kpxcObserverHelper.observerConfig = {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true,
    attributeFilter: [ 'style', 'class' ]
};

// Initializes MutationObserver
kpxcObserverHelper.initObserver = async function() {
    kpxc.observer = new MutationObserver(function(mutations, obs) {
        if (document.visibilityState === 'hidden' || kpxcUI.mouseDown) {
            return;
        }

        // Limit the maximum number of mutations
        if (mutations.length > MAX_MUTATIONS) {
            mutations = mutations.slice(0, MAX_MUTATIONS);
        }

        const styleMutations = [];
        for (const mut of mutations) {
            if (kpxcObserverHelper.ignoredNode(mut.target)) {
                continue;
            }

            // Cache style mutations. We only need the last style mutation of the target.
            kpxcObserverHelper.cacheStyle(mut, styleMutations, mutations.length);

            if (mut.type === 'childList') {
                if (mut.addedNodes.length > 0) {
                    kpxcObserverHelper.handleObserverAdd(mut.addedNodes[0]);
                } else if (mut.removedNodes.length > 0) {
                    kpxcObserverHelper.handleObserverRemove(mut.removedNodes[0]);
                }
            } else if (mut.type === 'attributes' && (mut.attributeName === 'class' || mut.attributeName === 'style')) {
                // Only accept targets with forms
                const forms = matchesWithNodeName(mut.target, 'FORM')
                    ? mut.target
                    : mut.target.getElementsByTagName('form');
                if (forms?.length === 0 && !kpxcSites.exceptionFound(mut.target.classList, mut.target)) {
                    continue;
                }

                // There's an issue here. We cannot know for sure if the class attribute if added or removed.
                kpxcObserverHelper.handleObserverAdd(mut.target);
            }
        }

        // Handle cached style mutations
        for (const styleMut of styleMutations) {
            if (styleMut.display !== 'none' && styleMut.display !== '') {
                kpxcObserverHelper.handleObserverAdd(styleMut.target);
            } else {
                kpxcObserverHelper.handleObserverRemove(styleMut.target);
            }
        }
    });

    if (document.body) {
        kpxc.observer.observe(document.body, kpxcObserverHelper.observerConfig);
    }
};

// Stores mutation style to an cache array
// If there's a single style mutation, it's safe to calculate it
kpxcObserverHelper.cacheStyle = function(mut, styleMutations, mutationCount) {
    // Do not cache elements with animations
    if (mut?.attributeName !== 'style'
        || mut?.target?.style?.transform !== ''
        || mut?.target?.style?.transformStyle !== '') {
        return;
    }

    // If the target is inside a form we are monitoring, calculate the CSS style for better compatibility.
    // getComputedStyle() is very slow, so we cannot do that for every style target.
    let style = mut.target.style;
    if (kpxcForm.formIdentified(mut.target.parentNode) || mutationCount === 1) {
        style = getComputedStyle(mut.target);
    }

    if (style.display || style.zIndex) {
        if (!styleMutations.some(m => m.target === mut.target)) {
            styleMutations.push({
                target: mut.target,
                display: style.display,
                zIndex: style.zIndex
            });
        } else {
            const currentStyle = styleMutations.find(m => m.target === mut.target);
            if (currentStyle
                && (currentStyle.display !== style.display
                || currentStyle.zIndex !== style.zIndex)) {
                currentStyle.display = style.display;
                currentStyle.zIndex = style.zIndex;
            }
        }
    }
};

// Gets input fields from the target
kpxcObserverHelper.getInputs = function(target, ignoreVisibility = false) {
    // Basic check for input element
    const inputAllowed = (elem) => !elem.disabled
        && elem.getLowerCaseAttribute('type') !== 'hidden'
        && !kpxcObserverHelper.alreadyIdentified(elem);

    // Ignores target element if it's not an element node
    if (kpxcObserverHelper.ignoredNode(target)) {
        return [];
    }

    // Filter out any input fields with type 'hidden' right away
    let inputFields = [];
    target.childElementCount > 0 && target.querySelectorAll('input')?.forEach((elem) => {
        if (inputAllowed(elem)) {
            inputFields.push(elem);
        }
    });

    if (matchesWithNodeName(target, 'input')) {
        inputFields.push(target);
    }

    if (kpxc.improvedFieldDetectionEnabledForPage) {
        const inputFieldsFromShadowDOM = kpxcObserverHelper.findInputsFromShadowDOM(target);
        if (inputFieldsFromShadowDOM.length > 0) {
            logDebug('Input fields from Shadow DOM found:', inputFieldsFromShadowDOM);
        }

        for (const inputField of inputFieldsFromShadowDOM) {
            if (!inputFields.includes(inputField)) {
                inputFields.push(inputField);
            }
        }
    }

    // Append any input fields in Shadow DOM that are directly in the target
    const targetShadowRoot = getShadowDOM(target);
    targetShadowRoot?.querySelectorAll('input')?.forEach((input) => {
        if (inputAllowed(input)) {
            inputFields.push(input);
        }
    });

    if (inputFields.length === 0) {
        return [];
    }

    // Do not allow more visible inputs than MAX_INPUTS (default value: 100) -> return the first 100
    if (inputFields.length > MAX_INPUTS) {
        inputFields = inputFields.slice(0, MAX_INPUTS);
    }

    // Only include input fields that match with kpxcObserverHelper.inputTypes
    const inputs = [];
    for (const field of inputFields) {
        if ((!ignoreVisibility && !kpxcFields.isVisible(field))
            || kpxcFields.isSearchField(field)) {
            continue;
        }

        const type = field.getLowerCaseAttribute('type');
        if (kpxcObserverHelper.inputTypes.includes(type)) {
            inputs.push(field);
        }
    }

    logDebug('Input fields found:', inputs);
    return inputs;
};

// Checks if the input field has already identified at page load
kpxcObserverHelper.alreadyIdentified = function(target) {
    return kpxc.inputs.some(e => e === target);
};

kpxcObserverHelper.findInputsFromShadowDOM = function(target) {
    const inputFields = [];
    traverseShadowDOM(target, inputFields);

    return inputFields;
};

// Adds elements to a monitor array. Identifies the input fields.
kpxcObserverHelper.handleObserverAdd = async function(target) {
    if (kpxcObserverHelper.ignoredElement(target)) {
        return;
    }

    // Sometimes the settings haven't been loaded before new input fields are detected
    if (Object.keys(kpxc.settings).length === 0) {
        kpxc.init();
        return;
    }

    const inputs = kpxcObserverHelper.getInputs(target);
    if (inputs.length === 0) {
        return;
    }

    await kpxc.initCombinations(inputs);
    await kpxcIcons.initIcons(kpxc.combinations);

    if (kpxc.databaseState === DatabaseState.UNLOCKED) {
        if (_called.retrieveCredentials === false) {
            await kpxc.retrieveCredentials();
            return;
        }

        kpxc.prepareCredentials();
    }

    kpxcIcons.deleteHiddenIcons();
};

// Removes monitored elements
kpxcObserverHelper.handleObserverRemove = function(target) {
    if (kpxcObserverHelper.ignoredElement(target)) {
        return;
    }

    const inputs = kpxcObserverHelper.getInputs(target, true);
    if (inputs.length === 0) {
        return;
    }

    kpxcIcons.deleteHiddenIcons();
};

// Handles CSS transitionend event
kpxcObserverHelper.handleTransitionEnd = function(e) {
    if (!e.isTrusted) {
        return;
    }

    kpxcObserverHelper.handleObserverAdd(e.currentTarget);
};

// Returns true if element should be ignored
kpxcObserverHelper.ignoredElement = function(target) {
    if (kpxcObserverHelper.ignoredNode(target)) {
        return true;
    }

    // Ignore elements that do not have a className (including SVG)
    if (typeof target.className !== 'string') {
        return true;
    }

    return false;
};

// Ignores all nodes that doesn't contain elements
// Also ignore few Youtube-specific custom nodeNames
kpxcObserverHelper.ignoredNode = function(target) {
    if (!target
        || kpxcObserverHelper.ignoredNodeTypes.some(e => e === target.nodeType)
        || kpxcObserverHelper.ignoredNodeNames.some(e => e === target.nodeName)
        || target.nodeName.startsWith('YTMUSIC')
        || target.nodeName.startsWith('YT-')) {
        return true;
    }

    return false;
};

// Gets Shadow DOM from the element
const getShadowDOM = function(elem) {
    if (!elem || kpxcObserverHelper.ignoredNode(elem)) {
        return;
    }

    try {
        return elem.openOrClosedShadowRoot ? elem.openOrClosedShadowRoot : browser.dom.openOrClosedShadowRoot(elem);
    } catch (e) {
        return elem.shadowRoot;
    }
};

// Filter for TreeWalker
const treeWalkerFilter = function(node) {
    return !node || node.disabled || node.getLowerCaseAttribute('type') === 'hidden'
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
};

// Traverses all child elements, looking for input fields inside Shadow DOM
const traverseShadowDOM = function(target, inputFields) {
    const treeWalker = document?.createTreeWalker(target, NodeFilter.SHOW_ELEMENT, treeWalkerFilter);
    let currentNode = treeWalker?.currentNode;

    while (currentNode) {
        if (!kpxcObserverHelper.ignoredNode(currentNode)
            && matchesWithNodeName(currentNode, 'input')
            && !kpxcObserverHelper.alreadyIdentified(currentNode)) {
            inputFields.push(currentNode);
        }

        const nodeShadowRoot = getShadowDOM(currentNode);
        if (nodeShadowRoot?.nodeType === Node.DOCUMENT_FRAGMENT_NODE && nodeShadowRoot?.childElementCount > 0) {
            // Document Fragments need a special handling. It can contain children with Shadow DOM.
            for (const child of nodeShadowRoot.children) {
                if (!kpxcObserverHelper.ignoredNode(child)) {
                    traverseShadowDOM(child, inputFields);
                }
            }
        } else if (nodeShadowRoot) {
            traverseShadowDOM(nodeShadowRoot, inputFields);
        }

        currentNode = treeWalker?.nextNode();
    }
};
