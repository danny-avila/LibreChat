import React from 'react';
// import '~/atom-one-dark.css';

export default function Embed({ children, language = ''}) {
  return (
    <pre>
      <div className="mb-4 rounded-md bg-black">
        <div className="relative flex items-center bg-gray-800 px-4 py-2 font-sans text-xs text-gray-200">
          <span className="">{ language }</span>
          <button className="ml-auto flex gap-2">
            <svg
              stroke="currentColor"
              fill="none"
              strokeWidth="2"
              viewBox="0 0 24 24"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              height="1em"
              width="1em"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect
                x="8"
                y="2"
                width="8"
                height="4"
                rx="1"
                ry="1"
              ></rect>
            </svg>
            Copy code
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          { children }
            {/* <span className="hljs-keyword">export</span> <span className="hljs-keyword">default</span> <span className="hljs-keyword">function</span> <span className="hljs-title function_">CodeWrapper</span>(<span className="hljs-params">{ text }</span>) {
  <span className="hljs-keyword">const</span> matchRegex = <span className="hljs-regexp">/(`[^`]+?`)/g</span>; <span className="hljs-comment">// regex to match backticks and text between them</span>
  <span className="hljs-keyword">const</span> parts = text.<span className="hljs-title function_">split</span>(matchRegex);
  <span className="hljs-variable language_">console</span>.<span className="hljs-title function_">log</span>(<span className="hljs-string">'parts'</span>, parts);

  <span className="hljs-comment">// map over the parts and wrap any backticked text with &lt;code&gt; tags</span>
  <span className="hljs-keyword">const</span> codeParts = parts.<span className="hljs-title function_">map</span>(<span className="hljs-function">(<span className="hljs-params">part, index</span>) =&gt;</span> {
    <span className="hljs-keyword">if</span> (part.<span className="hljs-title function_">match</span>(matchRegex)) {
      <>
      <span className="hljs-keyword">return</span> <span className="xml"><span className="hljs-tag">&lt;<span className="hljs-name">code</span> <span className="hljs-attr">key</span>=<span className="hljs-string">{index}</span>&gt;</span>{part}<span className="hljs-tag">&lt;/<span className="hljs-name">code</span>&gt;</span></span>;
      </>
    } <span className="hljs-keyword">else</span> {
      <>
      <span className="hljs-keyword">return</span> part.<span className="hljs-title function_">trim</span>(); <span className="hljs-comment">// remove leading/trailing whitespace from non-backticked text</span>
      </>
    }
  });

  <span className="hljs-keyword">return</span> <span className="xml"><span className="hljs-tag">&lt;&gt;</span>{codeParts}<span className="hljs-tag">&lt;/&gt;</span></span>; <span className="hljs-comment">// return the wrapped text</span>
} */}
        </div>
      </div>
    </pre>
  );
}
