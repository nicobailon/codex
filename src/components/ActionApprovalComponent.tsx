import React, { useState } from 'react';
import { Text, Box, useInput, useApp } from 'ink';
import { Select } from '@inkjs/ui';

interface Props {
    actionType: string;
    actionDetails: string;
    contextInfo?: string;
    onDecide: (approved: boolean, remember: boolean) => void;
}

/**
 * A terminal UI component for prompting the server operator to approve or reject actions
 */
export const ActionApprovalComponent: React.FC<Props> = ({
    actionType,
    actionDetails,
    contextInfo,
    onDecide,
}) => {
    const { exit } = useApp();
    const [remember, setRemember] = useState(false);
    const [selectedOption, setSelectedOption] = useState<'approve' | 'reject' | null>(null);

    // Handle selecting an option with Enter/Return
    const handleSelect = (item: { value: 'approve' | 'reject' }) => {
        setSelectedOption(item.value);
        onDecide(item.value === 'approve', remember && item.value === 'approve');
        exit();
    };

    // Allow toggling 'remember' with 'r' key and handling keyboard shortcuts
    useInput((input, key) => {
        // Toggle remember with 'r' key
        if (input === 'r') {
            setRemember(prev => !prev);
        }

        // Quick approve with 'y' key
        if (input === 'y') {
            onDecide(true, remember);
            exit();
        }

        // Quick reject with 'n' key
        if (input === 'n') {
            onDecide(false, false);
            exit();
        }

        // Exit with Esc or Ctrl+C
        if (key.escape || (key.ctrl && input === 'c')) {
            onDecide(false, false); // Treat escape as rejection
            exit();
        }
    });

    return (
        <Box borderStyle="round" borderColor="yellow" padding={1} flexDirection="column" width={80}>
            <Text bold color="yellow">🔒 Action Approval Required</Text>
            
            {contextInfo && (
                <Box marginTop={1}>
                    <Text dimColor>Context: {contextInfo}</Text>
                </Box>
            )}
            
            <Box marginTop={1}>
                <Text bold>Action Type: </Text>
                <Text color="green">{actionType}</Text>
            </Box>
            
            <Box marginTop={1} flexDirection="column">
                <Text bold>Details:</Text>
                <Box flexGrow={1} borderStyle="single" borderColor="gray" padding={1}>
                    <Text wrap="wrap">{actionDetails}</Text>
                </Box>
            </Box>
            
            <Box marginTop={1} flexDirection="column">
                <Text>Remember this decision? (<Text color="cyan">r</Text> to toggle)</Text>
                <Text color={remember ? "green" : "gray"}>Remember: {remember ? 'YES' : 'NO'}</Text>
            </Box>
            
            <Box marginTop={1}>
                <Select
                    options={[
                        { label: 'Approve (y)', value: 'approve' },
                        { label: 'Reject (n)', value: 'reject' },
                    ]}
                    onChange={handleSelect}
                    initialIndex={0}
                    highlight="#00FF00"
                    highlightForeground="#000000"
                />
            </Box>
            
            <Box marginTop={1}>
                <Text dimColor>Shortcuts: <Text color="cyan">y</Text> to approve, <Text color="cyan">n</Text> to reject, <Text color="cyan">r</Text> to toggle remember, <Text color="cyan">Esc</Text> to cancel</Text>
            </Box>
        </Box>
    );
};
