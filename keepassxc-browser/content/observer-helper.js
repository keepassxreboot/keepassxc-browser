'use strict';

const MAX_CHILDREN = 50;
const MAX_INPUTS = 100;
const MAX_MUTATIONS = 200;
const MUTATION_END_TIMEOUT = 1000; // ms

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
    'IMG',
    'LINK',
    'META',
    'SCRIPT',
    'TIME',
    'VIDEO',
];

kpxcObserverHelper.ignoredPartialNodeNames = [
    'AC-PUBLISH',
    'AC-TRACK',
    'COMMENT-BODY-HEADER',
    'CUJ-TRACKER',
    'FACEPLATE-EXPANDABLE',
    'FACEPLATE-LOADER',
    'FACEPLATE-PARTIAL',
    'FACEPLATE-TRACKER',
    'REDDIT-CHAT',
    'REDDIT-PDP',
    'RENDER-TEMPLATE',
    'SHREDDIT',
];

kpxcObserverHelper.ignoredClassNames = [
    'faceplate-internal-input'
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

kpxcObserverHelper.mutationTimeout = -1;

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

        let nodesChanged = false;
        for (const mut of mutations) {
            if (kpxcObserverHelper.ignoredNode(mut.target)) {
                continue;
            }

            if (kpxcFields.hasOverlay(mut.target)) {
                kpxcFields.discoverOverlays();
                kpxcFields.checkExistingFields();
                continue;
            }

            // Cache style mutations. We only need the last style mutation of the target.
            if (kpxcObserverHelper.checkStyleMutations(mut, mutations.length) > 0) {
                nodesChanged = true;
            }

            if (mut.type === 'childList') {
                nodesChanged = mut.addedNodes.length > 0 || mut.removedNodes.length > 0;
            } else if (mut.type === 'attributes' && (mut.attributeName === 'class' || mut.attributeName === 'style')) {
                // Only accept targets with forms
                const forms = matchesWithNodeName(mut.target, 'FORM')
                    ? mut.target
                    : mut.target.getElementsByTagName('form');
                if (forms?.length === 0 && !kpxcSites.exceptionFound(mut.target.classList, mut.target)) {
                    continue;
                }

                nodesChanged = true;
            }
        }

        if (nodesChanged) {
            // Clear the old timeout and prevent callback from happening
            if (kpxcObserverHelper.mutationTimeout) {
                clearTimeout(kpxcObserverHelper.mutationTimeout);
            }
            // After all mutations have been ended, parse input fields in the page after a timeout
            kpxcObserverHelper.mutationTimeout = setTimeout(async () => {
                await kpxc.initCredentialFields();
                kpxcIcons.deleteAllHiddenIcons();
            }, MUTATION_END_TIMEOUT);
        }
    });

    if (document.body) {
        kpxc.observer.observe(document.body, kpxcObserverHelper.observerConfig);
    }
};

// Stores mutation style to an array
// If there's a single style mutation, it's safe to calculate it
kpxcObserverHelper.checkStyleMutations = function(mut, mutationCount) {
    // Do not cache elements with animations
    if (mut?.attributeName !== 'style'
        || mut?.target?.style?.transform !== ''
        || mut?.target?.style?.transformStyle !== '') {
        return [];
    }

    // If the target is inside a form we are monitoring, calculate the CSS style for better compatibility.
    // getComputedStyle() is very slow, so we cannot do that for every style target.
    let style = mut.target.style;
    if (kpxcForm.formIdentified(mut.target.parentNode) || mutationCount === 1) {
        style = getComputedStyle(mut.target);
    }

    const styleMutations = [];
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

    return styleMutations;
};

kpxcObserverHelper.inputTypeIsAccepted = function(elem) {
    return kpxcObserverHelper.inputTypes.includes(elem?.getLowerCaseAttribute('type'));
};

// Gets input fields from the target
kpxcObserverHelper.getInputs = function(target, ignoreVisibility = false) {
    // Basic check for input element
    const inputAllowed = (elem) => !elem.disabled
        && kpxcObserverHelper.inputTypeIsAccepted(elem)
        && !hasIgnoredClassNames(elem)
        && !kpxcObserverHelper.alreadyIdentified(elem);

    // Ignores target element if it's not an element node
    if (kpxcObserverHelper.ignoredNode(target)) {
        return [];
    }

    // Filter out any input fields with unwanted types right away
    let inputFields = [];
    target.childElementCount > 0 && target.querySelectorAll('input')?.forEach((elem) => {
        if (inputAllowed(elem)) {
            inputFields.push(elem);
        }
    });

    // If target is already an input field
    if (matchesWithNodeName(target, 'input')) {
        inputFields.push(target);
    }

    if (kpxc.improvedFieldDetectionEnabledForPage && kpxcSites.isShadowDomQueryAllowed(target?.nodeName)) {
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

    // Only include input fields that are visible
    const inputs = [];
    for (const field of inputFields) {
        if ((!ignoreVisibility && !kpxcFields.isVisible(field))
            || kpxcFields.isSearchField(field)) {
            continue;
        }

        inputs.push(field);
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
        || kpxcObserverHelper.ignoredPartialNodeNames.some(e => target.nodeName?.includes(e))
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
        return 'openOrClosedShadowRoot' in elem
            ? elem.openOrClosedShadowRoot
            : browser.dom.openOrClosedShadowRoot(elem);
    } catch (_e) {
        return elem.shadowRoot;
    }
};

// Filter for TreeWalker
const treeWalkerFilter = function(node) {
    return !node ||
        node?.disabled ||
        (node instanceof Element
            && typeof node?.getAttribute === 'function'
            && node?.getLowerCaseAttribute('type') === 'hidden')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
};

// Traverses all child elements, looking for input fields inside Shadow DOM
const traverseShadowDOM = function(target, inputFields) {
    const treeWalker = document?.createTreeWalker(target, NodeFilter.SHOW_ELEMENT, treeWalkerFilter);
    let currentNode = treeWalker?.currentNode;

    while (currentNode) {
        if (!kpxcObserverHelper.ignoredNode(currentNode)
            && matchesWithNodeName(currentNode, 'input')
            && kpxcObserverHelper.inputTypeIsAccepted(currentNode)
            && !kpxcObserverHelper.alreadyIdentified(currentNode)
            && !hasIgnoredClassNames(currentNode)) {
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

const hasIgnoredClassNames = (elem) => kpxcObserverHelper.ignoredClassNames.some(e => elem.classList?.contains(e));
