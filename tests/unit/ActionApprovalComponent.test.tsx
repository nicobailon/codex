import React from 'react';
import { render } from 'ink-testing-library';
import { ActionApprovalComponent } from '../../src/components/ActionApprovalComponent';

describe('ActionApprovalComponent', () => {
  it('renders correctly with required props', () => {
    const onDecide = jest.fn();
    const { lastFrame } = render(
      <ActionApprovalComponent
        actionType="Test Action"
        actionDetails="Test Details"
        onDecide={onDecide}
      />
    );

    // Verify component renders with required props
    expect(lastFrame()).toContain('Action Approval Required');
    expect(lastFrame()).toContain('Test Action');
    expect(lastFrame()).toContain('Test Details');
    expect(lastFrame()).toContain('Remember: NO');
  });

  it('renders with context info when provided', () => {
    const onDecide = jest.fn();
    const { lastFrame } = render(
      <ActionApprovalComponent
        actionType="Test Action"
        actionDetails="Test Details"
        contextInfo="Test Context"
        onDecide={onDecide}
      />
    );

    // Verify component renders with context info
    expect(lastFrame()).toContain('Test Context');
  });

  it('toggles remember state when r key is pressed', () => {
    const onDecide = jest.fn();
    const { lastFrame, stdin } = render(
      <ActionApprovalComponent
        actionType="Test Action"
        actionDetails="Test Details"
        onDecide={onDecide}
      />
    );

    // Verify initial state
    expect(lastFrame()).toContain('Remember: NO');

    // Toggle remember state by pressing r
    stdin.write('r');

    // Verify state is toggled
    expect(lastFrame()).toContain('Remember: YES');

    // Toggle again
    stdin.write('r');

    // Verify state is toggled back
    expect(lastFrame()).toContain('Remember: NO');
  });

  it('calls onDecide with approval when y key is pressed', () => {
    const onDecide = jest.fn();
    const { stdin } = render(
      <ActionApprovalComponent
        actionType="Test Action"
        actionDetails="Test Details"
        onDecide={onDecide}
      />
    );

    // Press y to approve
    stdin.write('y');

    // Verify onDecide was called with correct args
    expect(onDecide).toHaveBeenCalledWith(true, false);
  });

  it('calls onDecide with rejection when n key is pressed', () => {
    const onDecide = jest.fn();
    const { stdin } = render(
      <ActionApprovalComponent
        actionType="Test Action"
        actionDetails="Test Details"
        onDecide={onDecide}
      />
    );

    // Press n to reject
    stdin.write('n');

    // Verify onDecide was called with correct args
    expect(onDecide).toHaveBeenCalledWith(false, false);
  });

  it('calls onDecide with remember=true when approved with remember enabled', () => {
    const onDecide = jest.fn();
    const { stdin } = render(
      <ActionApprovalComponent
        actionType="Test Action"
        actionDetails="Test Details"
        onDecide={onDecide}
      />
    );

    // Enable remember
    stdin.write('r');

    // Press y to approve
    stdin.write('y');

    // Verify onDecide was called with correct args
    expect(onDecide).toHaveBeenCalledWith(true, true);
  });

  it('calls onDecide with rejection when ESC key is pressed', () => {
    const onDecide = jest.fn();
    const { stdin } = render(
      <ActionApprovalComponent
        actionType="Test Action"
        actionDetails="Test Details"
        onDecide={onDecide}
      />
    );

    // Press ESC to cancel
    stdin.write('\u001B'); // ESC key

    // Verify onDecide was called with correct args
    expect(onDecide).toHaveBeenCalledWith(false, false);
  });
});
