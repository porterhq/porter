'use strict';

const { strict: assert } = require('assert');
const { replaceAll } = require('../../src/named_import');

describe('test/unit/named_import.test.js', function () {
  it('should replace single line import', function () {
    const code = `
import React from "react";
import { Loading, Card, Tab } from "antd";`;
    const result = replaceAll(code, {
      libraryName: 'antd',
      style: 'css',
    });
    assert.deepEqual(result.replace(/;import/g, ';\nimport').trim(), `
import React from "react";
import Loading from "antd/lib/loading";
import Card from "antd/lib/card";
import Tab from "antd/lib/tab";
import "antd/lib/loading/style/css";
import "antd/lib/card/style/css";
import "antd/lib/tab/style/css";`.trim());
  });

  it('should replace multiline imports', function () {
    const code = `
import React from "react";
import {
  Upload,
  Button,
  Tab,
  Toggle,
  InplaceEditor,
  Loading,
  Tag,
} from "antd";`;
    const result = replaceAll(code, {
      libraryName: 'antd',
      style: 'css',
    });
    assert.deepEqual(result.replace(/;import/g, ';\nimport').trim(), `
import React from "react";
import Upload from "antd/lib/upload";
import Button from "antd/lib/button";
import Tab from "antd/lib/tab";
import Toggle from "antd/lib/toggle";
import InplaceEditor from "antd/lib/inplace-editor";
import Loading from "antd/lib/loading";
import Tag from "antd/lib/tag";
import "antd/lib/upload/style/css";
import "antd/lib/button/style/css";
import "antd/lib/tab/style/css";
import "antd/lib/toggle/style/css";
import "antd/lib/inplace-editor/style/css";
import "antd/lib/loading/style/css";
import "antd/lib/tag/style/css";`.trim());
  });

  it('should work', function () {
    const code = `
import React, { useCallback, useRef } from "react";
import { Select, Button, Toggle } from "antd";`;
    const result = replaceAll(code, {
      libraryName: 'antd',
      style: 'css',
    });
    assert.deepEqual(result.replace(/;import/g, ';\nimport').trim(), `
import React, { useCallback, useRef } from "react";
import Select from "antd/lib/select";
import Button from "antd/lib/button";
import Toggle from "antd/lib/toggle";
import "antd/lib/select/style/css";
import "antd/lib/button/style/css";
import "antd/lib/toggle/style/css";`.trim());
  });

  it('should handle minified es modules', function () {
    const code = 'import{Card,Checkbox}from"antd";';
    const result = replaceAll(code, {
      libraryName: 'antd',
      style: 'css',
    });
    assert.deepEqual(result.replace(/;import/g, ';\nimport').trim(), `
import Card from "antd/lib/card";
import Checkbox from "antd/lib/checkbox";
import "antd/lib/card/style/css";
import "antd/lib/checkbox/style/css";`.trim());
  });

  it('should work on simple case', function () {
    const code = 'import { Modal } from "antd";\n';
    const result = replaceAll(code, {
      libraryName: 'antd',
      style: 'css',
    });
    assert.deepEqual(result.replace(/;import/g, ';\nimport').trim(), `
import Modal from "antd/lib/modal";
import "antd/lib/modal/style/css";`.trim());
  });

  it('should work on componentCase has priority over camel2DashComponentName', function () {
    const code = 'import { DifferenceBy } from "lodash"';
    const result = replaceAll(code, {
      libraryName: 'lodash',
      libraryDirectory: '',
      style: false,
      camel2DashComponentName: true,
      componentCase: 'camel'
    });
    assert.deepEqual(result, 'import DifferenceBy from "lodash/differenceBy";');
  });

  it('should work on camel2DashComponentName false', function () {
    const code = 'import { differenceBy } from "lodash"';
    const result = replaceAll(code, {
      libraryName: 'lodash',
      libraryDirectory: '',
      style: false,
      camel2DashComponentName: false,
    });
    assert.deepEqual(result, 'import differenceBy from "lodash/differenceBy";');
  });

  it('should work on camel case', function () {
    const code = 'import { differenceBy } from "lodash"';
    const result = replaceAll(code, {
      libraryName: 'lodash',
      libraryDirectory: '',
      style: false,
      componentCase: 'camel'
    });
    assert.deepEqual(result, 'import differenceBy from "lodash/differenceBy";');
  });

  it('should work on snake case', function () {
    const code = 'import { differenceBy } from "lodash"';
    const result = replaceAll(code, {
      libraryName: 'lodash',
      libraryDirectory: '',
      style: false,
      componentCase: 'snake'
    });
    assert.deepEqual(result, 'import differenceBy from "lodash/difference_by";');
  });

  it('should work on kebab case', function () {
    const code = 'import { differenceBy } from "lodash"';
    const result = replaceAll(code, {
      libraryName: 'lodash',
      libraryDirectory: '',
      style: false,
      componentCase: 'kebab'
    });
    assert.deepEqual(result, 'import differenceBy from "lodash/difference-by";');
  });
});
